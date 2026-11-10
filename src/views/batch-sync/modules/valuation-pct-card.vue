<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  fetchSyncTasks,
  fetchSyncTask,
  fetchValuationPctSubjects,
  startValuationPctSync,
  stopBatchSync
} from '@/service/api';
import SyncTaskPanel from './sync-task-panel.vue';

defineOptions({ name: 'ValuationPctCard' });

const message = useMessage();
const dialog = useDialog();

/**
 * 估值分位按日落盘（2026-11-04 P2）
 *
 * 与卡片 1/2/3 共用 bds_sync_task（全库一把锁），**必须最后跑**：
 * 批量同步 → 成分增量 → 指数估值增量 → 分位落盘。
 * 本卡片在组件内自行拉任务列表并按 scope 接管（同 MacroSyncCard 的做法），
 * 页面 onMounted 的 latest 分派只需把 valuation_pct 放进 NON_BATCH_SCOPES 即可。
 */
// 不能用 as const：NSelect 的 options 是可变数组，readonly 元组会报 TS4104
const MODE_OPTIONS: Array<{ label: string; value: 'M1' | 'M2' | 'M3' | 'auto' }> = [
  { label: 'M2 全量重建（推荐，兜底一切）', value: 'M2' },
  { label: 'M1 增量追加（只补新增交易日）', value: 'M1' },
  { label: 'M3 修订区间重算（需起始日）', value: 'M3' },
  { label: 'auto 按源序列指纹自动', value: 'auto' }
];

const mode = ref<'M1' | 'M2' | 'M3' | 'auto'>('M2');
const fromDate = ref<string | null>(null);
// P0-1：孤儿清理默认关闭且需二次确认；传 subjects 的单标的/子集重算后端一律忽略
const prune = ref(false);
// 候选清单不硬编码，从 GET /bds/valuation-percentile/subjects 现取（后端运行时读标的监测表）
const subjectList = ref<Api.Bds.ValuationPctSubject[]>([]);
/** 空 = 不传 subjects，后端运行时从标的监测表推导默认清单（过滤无估值数据的标的） */
const selectedSubjects = ref<string[]>([]);
/** 单标的快捷按钮：filterable + tag 允许输入候选清单外的代码 */
const singleSymbol = ref<string | null>(null);
const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

const subjectOptions = computed(() =>
  subjectList.value.map(item => {
    const flags = [
      item.in_default ? '默认' : '',
      item.has_data ? '' : '无估值数据·不落盘',
      item.orphan_in_store ? '监测表已移除·待清理' : ''
    ].filter(Boolean);
    return {
      label: `${item.symbol} · ${item.in_store ? `${item.row_count} 行` : '未落盘'}${flags.length ? ` · ${flags.join(' · ')}` : ''}`,
      value: item.symbol
    };
  })
);

/** 当前运行时默认清单数量；监测表变更后重跑一次任务即会刷新 */
const defaultCount = computed(() => subjectList.value.filter(item => item.in_default).length);
const defaultPlaceholder = computed(() => `不选 = 标的监测表全部有效标的（当前 ${defaultCount.value} 个）`);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const result = computed(() => (task.value?.result as Api.Bds.ValuationPctResult | null) ?? null);

/** 任务摘要：本任务 total_count 是「待算 as_of 行数」，不是标的数，必须写明 */
const taskDescription = computed(() => {
  if (!task.value) return '';
  const scopedMode = (task.value.scope_params as Record<string, any> | null)?.mode;
  return `任务 #${task.value.id}${scopedMode ? ` · 模式 ${scopedMode}` : ''} · 进度按「待算 as_of 行数」计`;
});

/** 统计格：写入行数与标的数分开，跳过标的来自 result（运行中尚无值） */
const taskStats = computed(() => [
  { label: '已完成 / 待算行数', value: `${task.value?.done_count ?? 0} / ${task.value?.total_count ?? 0}` },
  { label: '写入行数', value: task.value?.success_count ?? 0, color: '#18a058' },
  { label: '跳过标的（非失败）', value: result.value?.skipped_count ?? 0 },
  { label: '失败', value: task.value?.error_count ?? 0, color: '#d03050' }
]);

const sourceBySubjectText = computed(() => {
  const m = result.value?.source_as_of_by_subject;
  return m
    ? Object.entries(m)
        .map(([k, v]) => `${k} ${v ?? '—'}`)
        .join(' · ')
    : '';
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (task.value) loadTask(task.value.id);
  }, 3000);
}

async function loadTask(id?: number) {
  try {
    if (id) {
      const { data, error } = await fetchSyncTask(id);
      if (!error && data && data.scope === 'valuation_pct') {
        task.value = data;
        if (!isRunning.value) stopPolling();
      }
      return;
    }
    // fetchLatestSyncTask 只给最新一条；本卡片改用任务列表找回自己最近一次任务，
    // 这样即使最新任务是别的卡片发起的，上次分位重算的结果仍然可见
    const { data, error } = await fetchSyncTasks(20);
    if (!error && Array.isArray(data)) {
      const mine = data.find(item => item.scope === 'valuation_pct');
      if (mine) {
        task.value = mine;
        if (isRunning.value) startPolling();
      }
    }
  } catch {
    // 404 / 网络异常忽略，不影响其它卡片
  }
}

/** 候选标的清单只读加载；失败时下拉为空，但 tag 模式仍允许手输代码 */
async function loadSubjects() {
  try {
    const { data, error } = await fetchValuationPctSubjects();
    if (!error && Array.isArray(data)) subjectList.value = data;
  } catch {
    // 端点不可用时不影响卡片其它功能
  }
}

async function doStart() {
  starting.value = true;
  try {
    const payload: Api.Bds.ValuationPctSyncRequest = { mode: mode.value };
    if (mode.value === 'M3') payload.from_date = fromDate.value;
    // 空 = 不传 subjects ⇒ 后端运行时读标的监测表；非空（含单标的）一律不删别人的历史行
    if (selectedSubjects.value.length) payload.subjects = selectedSubjects.value;
    if (prune.value) payload.prune_orphans = true;
    const { data, error } = await startValuationPctSync(payload);
    if (error) {
      message.error(error.message || '启动失败');
      return;
    }
    message.success(`已启动任务 #${data.id}`);
    await loadTask(data.id);
    startPolling();
  } finally {
    starting.value = false;
  }
}

/** 按单个标的落盘：固定 M1 + subjects=[symbol]（P1-5 预裁定） */
async function handleSingle() {
  const code = singleSymbol.value?.trim();
  if (!code) {
    message.warning('请先选择或输入标的代码');
    return;
  }
  starting.value = true;
  try {
    const { data, error } = await startValuationPctSync({ mode: 'M1', subjects: [code] });
    if (error) {
      message.error(error.message || '启动失败');
      return;
    }
    message.success(`已启动单标的增量落盘 #${data.id}（${code}）`);
    await loadTask(data.id);
    startPolling();
  } finally {
    starting.value = false;
  }
}

async function handleStart() {
  if (mode.value === 'M3' && !fromDate.value) {
    message.warning('M3 需要填写修订起始日（YYYY-MM-DD）');
    return;
  }
  if (prune.value) {
    dialog.warning({
      title: '确认清理孤儿标的',
      content:
        '此操作会删除不在标的白名单内的所有历史行，不可撤销。仅在「不指定标的 + M2/auto」模式下生效；单标的/子集重算后端会自动忽略该开关。',
      positiveText: '确认执行',
      negativeText: '取消',
      onPositiveClick: () => {
        void doStart();
      }
    });
    return;
  }
  await doStart();
}

async function handleStop() {
  if (!task.value) return;
  stopping.value = true;
  try {
    const { data, error } = await stopBatchSync(task.value.id);
    if (error) {
      message.error(error.message || '停止失败');
      return;
    }
    message.info(data?.message || '停止信号已发出');
    await loadTask(task.value.id);
  } finally {
    stopping.value = false;
  }
}

onMounted(() => {
  loadTask();
  loadSubjects();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <NCard size="small" class="bds-sync-card" style="margin-top: 16px">
    <template #header>估值分位按日落盘（PE / PB / PS / 股息率 × 3 / 5 / 10 年）</template>
    <template #header-extra>
      <NButton size="small" :loading="starting" :disabled="isRunning" @click="handleStart">启动</NButton>
      <NButton v-if="isRunning" size="small" :loading="stopping" @click="handleStop">停止</NButton>
    </template>

    <div style="font-size: 12px; color: #999; line-height: 1.7">
      一行 = 一个标的一个观察日（as_of）。窗口按
      <b>日历对日</b>
      回溯（如观察日 2025-10-23 的 10 年窗口左界 2015-10-23），
      锚点是各标的最后一个有值交易日；分位值恒定，时间推移只追加新行。
      <br />
      默认范围
      <b>运行时从标的监测表读取</b>
      （自动过滤无估值数据的标的，如 SPX / GC00Y）； 监测表增删标的后
      <b>需重跑一次本任务</b>
      才会跟上，不会自动触发。
      <br />
      ⚠️ 与批量同步共用全局任务锁：请按「批量同步 → 成分增量 → 指数估值增量 →
      <b>本任务最后</b>
      」串行执行； 系统没有定时器，需每日手动点或外部定时调 HTTP。
    </div>

    <NSpace align="center" :size="10" wrap style="margin-top: 8px">
      <span class="text-12px" style="color: #666">标的范围</span>
      <NSelect
        v-model:value="selectedSubjects"
        multiple
        filterable
        clearable
        :options="subjectOptions"
        :disabled="isRunning"
        :placeholder="defaultPlaceholder"
        style="width: 420px"
      />
      <span class="text-12px" style="color: #999">仅重算选中标的；单标的 / 子集重算永不删其它标的历史行</span>
    </NSpace>

    <NSpace align="center" :size="10" wrap style="margin-top: 8px">
      <span class="text-12px" style="color: #666">单标的落盘</span>
      <NSelect
        v-model:value="singleSymbol"
        filterable
        tag
        clearable
        :options="subjectOptions"
        :disabled="isRunning"
        placeholder="选择或输入标的代码"
        style="width: 260px"
      />
      <NButton :loading="starting" :disabled="isRunning || !singleSymbol" @click="handleSingle">
        按单个标的落盘（M1 增量）
      </NButton>
      <span class="text-12px" style="color: #999">只补该标的新增交易日；上游历史修订请跑 M2 全量</span>
    </NSpace>

    <NSpace align="center" :size="10" wrap style="margin-top: 8px">
      <NSelect v-model:value="mode" :options="MODE_OPTIONS" :disabled="isRunning" style="width: 300px" />
      <NCheckbox v-model:checked="prune" :disabled="isRunning">
        <span style="color: #d03050">清理孤儿标的（危险，默认关）</span>
      </NCheckbox>
      <span v-if="selectedSubjects.length && prune" class="text-12px" style="color: #d03050">
        本次指定了标的，后端会忽略该开关
      </span>
      <NInput v-if="mode === 'M3'" v-model:value="fromDate" placeholder="修订起始日 YYYY-MM-DD" style="width: 200px" />
    </NSpace>

    <SyncTaskPanel :task="task" :running="isRunning" :description="taskDescription" :stats="taskStats">
      <div v-if="result" style="margin-top: 8px">
        <div v-if="result.audit.changed > 0" class="text-12px" style="color: #d03050">
          ⚠️ 本次有 {{ result.audit.changed }} 行分位发生变化（最大 {{ result.audit.max_pct }} pct）
          ——上游历史修订或口径变更时会发生，请核对。
        </div>
        <div class="text-12px" style="color: #666; line-height: 1.8; margin-top: 8px">
          模式 {{ result.mode }} · 窗口 {{ result.window_mode }} · 源末日 {{ result.source_as_of ?? '—' }} · 区间
          {{ result.as_of_range?.[0] ?? '—' }} ~ {{ result.as_of_range?.[1] ?? '—' }}
          <br />
          写入 {{ result.rows_upserted }} 行 · 变更 {{ result.audit.changed }} · 新增 {{ result.audit.appeared }} · 消失
          {{ result.audit.vanished }} · 孤儿清理 {{ result.orphans_deleted }}
          <template v-if="result.prune_orphans">（已开启清理）</template>
          · 耗时 {{ result.duration_ms }} ms
          <br />
          <template v-if="result.skipped_count > 0">
            {{ result.skipped_count }} 个标的输入指纹、源末日、窗口口径均未变，按分位恒定性跳过写入（非失败）
          </template>
          <template v-if="result.cut_stale_subjects?.length">
            ⚠️ {{ result.cut_stale_subjects.length }} 个标的窗口口径陈旧，已强制全量重建
          </template>
          <template v-if="result.schema_stale_subjects?.length">
            <br />
            🧱 {{ result.schema_stale_subjects.length }} 个标的因表结构变更触发历史行回填（schema_epoch
            {{ result.schema_epoch ?? '—' }}）
          </template>
          <template v-if="result.fp_changed_subjects?.length">
            <br />
            🔄 {{ result.forced_full_count }} 个标的因输入指纹变化 / 口径陈旧 / 结构变更被强制全量重建（指纹变化：{{
              result.fp_changed_subjects.join('、')
            }}）——上游历史修订会改动上千行，只重写最新行是错的
          </template>
          <template v-if="sourceBySubjectText">
            <br />
            各标的源末日：{{ sourceBySubjectText }}
          </template>
          <template v-if="result.default_subjects">
            <br />
            默认清单 {{ result.default_subjects.length }} 个（来源：{{ result.subject_source ?? '标的监测表' }}）
            <template v-if="result.excluded_no_data?.length">
              · 无估值数据被过滤：{{ result.excluded_no_data.join('、') }}
            </template>
            <template v-if="result.orphan_in_store?.length">
              <br />
              ⚠️ 监测表已移除但落表仍有历史行：{{
                result.orphan_in_store.join('、')
              }}（默认保留；需显式勾选「清理孤儿标的」才删）
            </template>
          </template>
          <template v-if="result.monitor_fallback">
            <br />
            ⚠️ 标的监测表读取失败，本次已回退兜底常量，请检查数据库
          </template>
        </div>
      </div>
    </SyncTaskPanel>
  </NCard>
</template>
