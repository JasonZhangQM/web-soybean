<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { fetchSyncTask, fetchSyncTasks, startChainedSync, stopBatchSync } from '@/service/api';
import SyncTaskPanel from './sync-task-panel.vue';

defineOptions({ name: 'ChainedSyncCard' });

/**
 * 串联同步卡片（页面顶部，宏观与基础数据卡片之前）
 *
 * 单条后端链任务（scope=chained_sync）按固定依赖顺序依次执行勾选的卡片：
 * - 每张卡作为独立子任务串行执行，各卡片自身进度面板照常认领展示；
 * - 失败继续（某卡失败/被停不阻断后续），仅链级停止中断整链；
 * - 卡片内部设置保持不变：启动时经 resolveCard 收集各卡当前表单的 payload，
 *   链启动后改表单不影响本次链（参数已固化进链任务）。
 *
 * 职责边界：本组件只负责「勾选 → 汇总确认 → 启动 → 链进度展示」；
 * 各卡 payload 的校验与组装由父页 resolveCard 提供（复用各卡现有校验逻辑）。
 */

/** 单张卡片的链入口：params 与该卡片原启动 payload 完全同构，risks 为需确认项文案 */
interface ChainCardEntry {
  card: string;
  params: Record<string, unknown>;
  risks: string[];
}

const props = defineProps<{
  /** 父页提供：按卡片标识解析链入口（校验 + 组参 + 汇总确认项）；返回 error 时中断启动 */
  resolveCard: (key: string) => { entries: ChainCardEntry[] } | { error: string };
  /** 其它卡片有任务在跑（全局互斥）⇒ 启动按钮禁用 */
  blocked?: boolean;
  /** 页面存活闸门（路由 KeepAlive 的 activated/deactivated 维护），与其它卡片轮询同口径 */
  pageGate?: () => boolean;
}>();

const emit = defineEmits<{ running: [boolean] }>();

/** 页面卡片（固定依赖顺序；宏观卡在链中可能拆出 bills_import 单元，见 UNIT_LABELS） */
const PAGE_CARDS = [
  { key: 'macro_sync', label: '宏观与基础数据' },
  { key: 'batch_sync', label: '个股财务及行情批量同步' },
  { key: 'index_backfill', label: '指数成分股' },
  { key: 'index_fund_agg', label: '指数财务聚合' },
  { key: 'index_valuation', label: '指数估值重算' },
  { key: 'valuation_pct', label: '估值分位按日落盘' },
  { key: 'um_pct_latest', label: '最新分位截面' }
] as const;

/** 执行单元 → 展示名（含宏观卡拆出的 bills_import） */
const UNIT_LABELS: Record<string, string> = {
  macro_sync: '宏观与基础数据',
  bills_import: '交易明细导入',
  batch_sync: '个股财务及行情批量同步',
  index_backfill: '指数成分股',
  index_fund_agg: '指数财务聚合',
  index_valuation: '指数估值重算',
  valuation_pct: '估值分位按日落盘',
  um_pct_latest: '最新分位截面'
};

const UNIT_STATUS_MAP: Record<string, { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
  pending: { text: '等待中', type: 'default' },
  running: { text: '运行中', type: 'info' },
  done: { text: '已完成', type: 'success' },
  failed: { text: '失败', type: 'error' },
  stopped: { text: '已停止', type: 'warning' }
};

const message = useMessage();
const dialog = useDialog();

/** 勾选状态：默认全选（会话内记忆，刷新回默认） */
const selected = ref<Record<string, boolean>>(
  PAGE_CARDS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {} as Record<string, boolean>)
);
const allSelected = computed(() => PAGE_CARDS.every(c => selected.value[c.key]));
function toggleAll(value: boolean) {
  PAGE_CARDS.forEach(c => {
    selected.value[c.key] = value;
  });
}

const chainTask = ref<Api.Bds.SyncTask | null>(null);
const starting = ref(false);
const stopping = ref(false);

const isChainRunning = computed(() => chainTask.value?.status === 'running' || chainTask.value?.status === 'pending');

interface UnitResult {
  card: string;
  task_id: number | null;
  status: string;
  done: number;
  total: number;
  success: number;
  error: number;
  message: string | null;
}

/** 链行 result.cards：各执行单元结果（运行中为已完成部分的追加序列） */
const unitResults = computed<UnitResult[]>(() => {
  const result = (chainTask.value?.result || {}) as Record<string, unknown>;
  return Array.isArray(result.cards) ? (result.cards as UnitResult[]) : [];
});
const currentCardLabel = computed(() => {
  const result = (chainTask.value?.result || {}) as Record<string, unknown>;
  const current = result.current_card as string | null;
  return current ? UNIT_LABELS[current] || current : '';
});
const failedUnits = computed(() => unitResults.value.filter(u => u.status === 'failed' || u.status === 'stopped'));

const chainDescription = computed(() => {
  const task = chainTask.value;
  if (!task) return '';
  const total = task.total_count || 0;
  const parts = [`任务 #${task.id} · ${task.done_count || 0}/${total} 卡`];
  if (isChainRunning.value && currentCardLabel.value) parts.push(`当前：${currentCardLabel.value}`);
  return parts.join(' · ');
});

const chainStats = computed(() => [
  { label: '执行单元', value: `${chainTask.value?.done_count || 0}/${chainTask.value?.total_count || 0}` },
  {
    label: '失败单元',
    value: failedUnits.value.length,
    color: failedUnits.value.length > 0 ? '#d03050' : undefined
  }
]);

// ===================== 启动（勾选校验 → 组参 → 汇总一次确认 → API） =====================

async function handleStart() {
  const keys = PAGE_CARDS.filter(c => selected.value[c.key]).map(c => c.key);
  if (keys.length === 0) {
    message.warning('请至少勾选一张卡片');
    return;
  }
  const entries: { card: string; params: Record<string, unknown> }[] = [];
  const risks: string[] = [];
  for (const key of keys) {
    // 逐卡走父页校验 + 组参；任一卡校验失败 → 整体中断（提示指向具体卡片）
    const res = props.resolveCard(key);
    if ('error' in res) {
      message.warning(res.error);
      return;
    }
    for (const entry of res.entries) {
      entries.push({ card: entry.card, params: entry.params });
      risks.push(...entry.risks);
    }
  }
  if (risks.length > 0) {
    // 汇总一次确认：把各勾选卡片命中的危险项（历史行情回填/财务聚合范围/估值只填终点/孤儿清理）
    // 合并为一个确认弹窗，替代逐卡弹窗（2026-11-22 方案定稿）
    dialog.warning({
      title: '确认串联启动',
      content: () =>
        h(
          'div',
          { style: 'white-space: pre-line' },
          `本次串联共 ${entries.length} 个执行单元，包含以下需确认项：\n${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        ),
      positiveText: '确认启动',
      negativeText: '取消',
      onPositiveClick: () => {
        void doStart(entries);
      }
    });
    return;
  }
  await doStart(entries);
}

async function doStart(entries: { card: string; params: Record<string, unknown> }[]) {
  starting.value = true;
  try {
    const { data, error } = await startChainedSync({ cards: entries });
    if (error) {
      message.error(error.message || '串联启动失败');
      return;
    }
    message.success(`已启动串联同步链 #${data.id}（${entries.length} 个执行单元，逐卡串行）`);
    chainTask.value = data;
    emit('running', true);
    startPolling();
  } finally {
    starting.value = false;
  }
}

// ===================== 停止（链级：停当前卡 + 取消剩余） =====================

async function handleStop() {
  if (!chainTask.value) return;
  stopping.value = true;
  try {
    const { data, error } = await stopBatchSync(chainTask.value.id);
    if (error) {
      message.error(error.message || '停止失败');
      return;
    }
    message.info(data?.message || '停止信号已发出（当前卡在项间停下，剩余卡片取消）');
    // 稍候刷新一次链状态，让「已停止」尽快回显
    const id = chainTask.value.id;
    setTimeout(() => {
      void loadChainTask(id);
    }, 1000);
  } finally {
    stopping.value = false;
  }
}

// ===================== 轮询与认领（与其它卡片同模式） =====================

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (props.pageGate && !props.pageGate()) return;
    if (document.hidden) return;
    if (chainTask.value) void loadChainTask(chainTask.value.id);
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function loadChainTask(id: number) {
  try {
    const { data, error } = await fetchSyncTask(id);
    if (!error && data) {
      if (data.scope !== 'chained_sync') return;
      chainTask.value = data;
      if (!isChainRunning.value) {
        stopPolling();
        emit('running', false);
      }
    }
  } catch {
    // 404 忽略
  }
}

onMounted(async () => {
  try {
    // 认领最近一条串联链任务：运行中恢复轮询，终态仅回显（刷新页面不丢进度）
    const { data, error } = await fetchSyncTasks(20);
    if (!error && Array.isArray(data)) {
      const mine = data.find(item => item.scope === 'chained_sync');
      if (mine) {
        chainTask.value = mine;
        if (isChainRunning.value) {
          emit('running', true);
          startPolling();
        }
      }
    }
  } catch {
    // 忽略
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <NCard title="串联同步" size="small">
    <template #header-extra>
      <NSpace align="center" :size="12">
        <span style="font-size: 12px; color: #999">按依赖顺序逐卡执行 · 失败不阻断后续</span>
        <NButton
          type="primary"
          size="small"
          :loading="starting"
          :disabled="isChainRunning || blocked"
          @click="handleStart"
        >
          串联启动
        </NButton>
        <NButton v-if="isChainRunning" size="small" :loading="stopping" @click="handleStop">停止链</NButton>
      </NSpace>
    </template>

    <NCheckbox
      :checked="allSelected"
      :indeterminate="!allSelected && PAGE_CARDS.some(c => selected[c.key])"
      :disabled="isChainRunning"
      @update:checked="toggleAll"
    >
      全选（按依赖顺序执行，顺序不可调整）
    </NCheckbox>
    <NSpace :size="16" :wrap="true" style="margin-top: 8px">
      <NCheckbox
        v-for="card in PAGE_CARDS"
        :key="card.key"
        :checked="selected[card.key]"
        :disabled="isChainRunning"
        @update:checked="(v: boolean) => (selected[card.key] = v)"
      >
        {{ card.label }}
      </NCheckbox>
    </NSpace>

    <SyncTaskPanel :task="chainTask" :running="isChainRunning" :description="chainDescription" :stats="chainStats">
      <div v-if="chainTask" style="margin-top: 12px">
        <NSpace :size="8" :wrap="true">
          <NTag
            v-for="unit in unitResults"
            :key="unit.card"
            :type="UNIT_STATUS_MAP[unit.status]?.type || 'default'"
            size="small"
            round
          >
            {{ UNIT_LABELS[unit.card] || unit.card }} · {{ UNIT_STATUS_MAP[unit.status]?.text || unit.status }}
          </NTag>
        </NSpace>
        <NCollapse v-if="!isChainRunning && failedUnits.length > 0" style="margin-top: 10px">
          <NCollapseItem :title="`未完成单元明细（${failedUnits.length}）`" name="units">
            <div v-for="unit in failedUnits" :key="unit.card" style="font-size: 13px; line-height: 1.8">
              <NTag :type="unit.status === 'failed' ? 'error' : 'warning'" size="small" style="margin-right: 8px">
                {{ UNIT_LABELS[unit.card] || unit.card }}
              </NTag>
              <span v-if="unit.task_id" style="color: #999; margin-right: 8px">子任务 #{{ unit.task_id }}</span>
              <span style="color: #d03050">{{ unit.message || UNIT_STATUS_MAP[unit.status]?.text }}</span>
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>
    </SyncTaskPanel>
  </NCard>
</template>
