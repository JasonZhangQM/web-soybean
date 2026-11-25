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
import { useBdsStore } from '@/store/modules/bds';
import SyncTaskPanel from './sync-task-panel.vue';

defineOptions({ name: 'ValuationPctCard' });

const message = useMessage();
const dialog = useDialog();
const bdsStore = useBdsStore();

/** 串联同步链运行中（父页下发）：本卡启动/单标的按钮禁用，防撞全局互斥 409 */
const props = defineProps<{
  chainRunning?: boolean;
}>();

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
  { label: 'auto 按源序列指纹自动（推荐，默认）', value: 'auto' },
  { label: 'M1 增量追加（只补新增交易日）', value: 'M1' },
  { label: 'M2 全量重建（兜底一切）', value: 'M2' },
  { label: 'M3 修订区间重算（需起始日）', value: 'M3' }
];

// 标的范围档（2026-11-24 起由 SymbolInfo 驱动，取代监测表默认清单）：
// all=A股指数∪A股个股 / index=仅A股指数 / stock=仅A股个股 / industry=指定行业个股；
// manual=手写清单（走 subjects 显式参数，可含指数，后端不做二次过滤）
type PctScope = 'all' | 'index' | 'stock' | 'industry' | 'manual';
const SCOPE_OPTIONS: Array<{ label: string; value: PctScope }> = [
  { label: '全部有效标的（A股指数 ∪ A股个股）', value: 'all' },
  { label: '仅 A股指数', value: 'index' },
  { label: '仅 A股个股', value: 'stock' },
  { label: '指定行业（个股）', value: 'industry' },
  { label: '手写清单', value: 'manual' }
];
const TRADING_STATUS_OPTIONS: Array<{ label: string; value: 'trading' | 'delisted' | 'all' }> = [
  { label: '仅在市', value: 'trading' },
  { label: '仅退市', value: 'delisted' },
  { label: '全部（含退市）', value: 'all' }
];

const mode = ref<'M1' | 'M2' | 'M3' | 'auto'>('auto');
const scope = ref<PctScope>('all');
const tradingStatus = ref<'trading' | 'delisted' | 'all'>('trading');
const industryValue = ref<string | null>(null);
const manualSubjects = ref<string[]>([]);
const fromDate = ref<string | null>(null);
// P0-1：孤儿清理默认关闭且需二次确认；传 subjects 的单标的/子集重算后端一律忽略
const prune = ref(false);
// 候选清单不硬编码，从 GET /bds/valuation-percentile/subjects 现取（供手写清单下拉提示）
const subjectList = ref<Api.Bds.ValuationPctSubject[]>([]);
const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

const industryOptions = computed(() => bdsStore.getIndustryOptions());
/** 退市口径仅作用个股档：all / stock / industry 显示，index / manual 隐藏 */
const showTradingStatus = computed(() => ['all', 'stock', 'industry'].includes(scope.value));

const subjectOptions = computed(() =>
  subjectList.value.map(item => {
    const flags = [
      item.in_default ? '监测' : '',
      item.has_data ? '' : '无估值数据·不落盘',
      item.orphan_in_store ? '监测表已移除·待清理' : ''
    ].filter(Boolean);
    return {
      label: `${item.symbol} · ${item.in_store ? `${item.row_count} 行` : '未落盘'}${flags.length ? ` · ${flags.join(' · ')}` : ''}`,
      value: item.symbol
    };
  })
);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');

/** 表单锁定：本卡任务运行中 或 串联链运行中 ⇒ 模式/标的/开关不可编辑（防误改，链参数已固化） */
const formLocked = computed(() => isRunning.value || !!props.chainRunning);
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

const SOURCE_DISPLAY_CAP = 20;
const sourceBySubjectEntries = computed(() => Object.entries(result.value?.source_as_of_by_subject ?? {}));
/** 全市场量级下逐标的明细不展示（后端超 200 截断为 null，前端超 20 只显示计数） */
const sourceBySubjectText = computed(() =>
  sourceBySubjectEntries.value.length && sourceBySubjectEntries.value.length <= SOURCE_DISPLAY_CAP
    ? sourceBySubjectEntries.value.map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ')
    : ''
);
const sourceBySubjectOverflow = computed(() => (result.value?.source_as_of_by_subject_count ?? 0) > SOURCE_DISPLAY_CAP);

/** 按当前表单组装请求体：手写清单走 subjects（显式清单，优先级最高），其余走 scope 范围档 */
function buildPayload(): Api.Bds.ValuationPctSyncRequest {
  const payload: Api.Bds.ValuationPctSyncRequest = { mode: mode.value };
  if (mode.value === 'M3') payload.from_date = fromDate.value;
  if (scope.value === 'manual') {
    payload.subjects = manualSubjects.value;
  } else {
    payload.scope = scope.value;
    if (scope.value === 'industry') payload.industry = industryValue.value;
    if (showTradingStatus.value) payload.trading_status = tradingStatus.value;
  }
  if (prune.value) payload.prune_orphans = true;
  return payload;
}

/** 启动前的表单校验：M3 起始日、手写清单非空、指定行业已选；返回错误文案或 null */
function validateForm(): string | null {
  if (mode.value === 'M3' && !fromDate.value) return 'M3 需要填写修订起始日（YYYY-MM-DD）';
  if (scope.value === 'manual' && !manualSubjects.value.length) return '手写清单需至少选择或输入一个标的代码';
  if (scope.value === 'industry' && !industryValue.value) return '指定行业档需先选择行业';
  return null;
}

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
    if (document.hidden) return;
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
      } else if (data && data.scope !== 'valuation_pct') {
        // 任务被别的 scope 抢走时别空转刷接口
        stopPolling();
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
    // 空 subjects + 范围档 ⇒ 后端运行时按证券信息表解析清单；显式清单一律不删别人的历史行
    const { data, error } = await startValuationPctSync(buildPayload());
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

/** 按单个标的落盘（M1 + subjects=[code]）已删除：统一走范围档/手写清单入口（2026-11-24） */

async function handleStart() {
  const formError = validateForm();
  if (formError) {
    message.warning(formError);
    return;
  }
  if (prune.value) {
    dialog.warning({
      title: '确认清理孤儿标的',
      content:
        '此操作会删除不在范围白名单（证券信息表 A股指数 ∪ A股个股）之外的所有历史行，不可撤销。仅在「手写清单未启用 + M2/auto」模式下生效；手写清单重算后端会自动忽略该开关。',
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

/** 串联同步链入口（父页经模板 ref 调用）：校验 + 组参 + 危险项，与 handleStart/doStart 同口径 */
function getChainEntry():
  | { entries: Array<{ card: string; params: Record<string, unknown>; risks: string[] }> }
  | { error: string } {
  const formError = validateForm();
  if (formError) return { error: `「估值分位按日落盘」${formError}` };
  const payload = buildPayload();
  const risks: string[] = [];
  if (prune.value && scope.value !== 'manual') {
    risks.push('估值分位按日落盘将清理孤儿标的（删除不在范围白名单内的历史行，不可撤销）');
  }
  if (scope.value === 'all' && mode.value === 'M2') {
    risks.push('估值分位按日落盘为全市场 M2 全量重建：首跑约 2,000 万行、耗时数小时');
  }
  return { entries: [{ card: 'valuation_pct', params: payload as unknown as Record<string, unknown>, risks }] };
}

/** 串联同步链依赖的状态与方法：isRunning 供父页判定全局互斥，getChainEntry 供链卡组参 */
defineExpose({ isRunning, getChainEntry });

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
    <template #header>
      估值分位按日落盘（PE / PB / PS / 股息率 × 3 / 5 / 10 年）
      <RouterLink to="/bds/market-data/percentile" class="sync-link" title="查看估值分位数据" @click.stop>↗</RouterLink>
    </template>
    <template #header-extra>
      <NButton size="small" :loading="starting" :disabled="formLocked" @click="handleStart">启动</NButton>
      <NButton v-if="isRunning" size="small" :loading="stopping" @click="handleStop">停止</NButton>
    </template>

    <div style="font-size: 12px; color: #999; line-height: 1.7">
      一行 = 一个标的一个观察日（as_of）。窗口按
      <b>日历对日</b>
      回溯（如观察日 2025-10-23 的 10 年窗口左界 2015-10-23），
      锚点是各标的最后一个有值交易日；分位值恒定，时间推移只追加新行。
      <br />
      标的范围
      <b>运行时从证券信息表读取</b>
      （A股指数 ∪ A股个股，外盘/商品如 SPX / GC00Y 天然排除）；无估值数据的标的逐只跳过
      （no_data，非失败）。全市场首跑约 2,000 万行、耗时数小时，建议过夜执行； 之后每日 auto 增量仅分钟级。
      <br />
      ⚠️ 与批量同步共用全局任务锁：请按「批量同步 → 成分增量 → 指数估值增量 →
      <b>本任务最后</b>
      」串行执行； 系统没有定时器，需每日手动点或外部定时调 HTTP。
    </div>

    <NSpace align="center" :size="10" wrap style="margin-top: 8px">
      <span class="text-12px" style="color: #666">标的范围</span>
      <NSelect v-model:value="scope" :options="SCOPE_OPTIONS" :disabled="formLocked" style="width: 280px" />
      <NSelect
        v-if="showTradingStatus"
        v-model:value="tradingStatus"
        :options="TRADING_STATUS_OPTIONS"
        :disabled="formLocked"
        style="width: 140px"
      />
      <NSelect
        v-if="scope === 'industry'"
        v-model:value="industryValue"
        filterable
        clearable
        :options="industryOptions"
        :disabled="formLocked"
        placeholder="选择行业"
        style="width: 220px"
      />
      <NSelect
        v-if="scope === 'manual'"
        v-model:value="manualSubjects"
        multiple
        filterable
        tag
        clearable
        :options="subjectOptions"
        :disabled="formLocked"
        placeholder="选择或输入代码，可含指数"
        style="width: 420px"
      />
      <span class="text-12px" style="color: #999">
        清单运行时按证券信息表解析；手写清单外的重算永不删其它标的历史行
      </span>
    </NSpace>

    <NSpace align="center" :size="10" wrap style="margin-top: 8px">
      <NSelect v-model:value="mode" :options="MODE_OPTIONS" :disabled="formLocked" style="width: 300px" />
      <NCheckbox v-model:checked="prune" :disabled="formLocked">
        <span style="color: #d03050">清理孤儿标的（危险，默认关）</span>
      </NCheckbox>
      <span v-if="scope === 'manual' && prune" class="text-12px" style="color: #d03050">
        手写清单重算，后端会忽略该开关
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
          模式 {{ result.mode }} · 范围 {{ result.scope ?? '—' }} · 清单来源 {{ result.subject_source ?? '—' }} · 标的
          {{ result.subject_count ?? result.subjects?.length ?? '—' }}
          （指数 {{ result.index_count ?? '—' }} / 个股 {{ result.stock_count ?? '—' }}） · 窗口
          {{ result.window_mode }} · 源末日 {{ result.source_as_of ?? '—' }} · 区间
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
          <template v-else-if="sourceBySubjectOverflow">
            <br />
            各标的源末日明细共 {{ result.source_as_of_by_subject_count }} 个标的，全市场量级不逐项展示
          </template>
          <template v-if="result.orphan_in_store?.length">
            <br />
            ⚠️ 落表有历史行但不在范围白名单内：{{
              result.orphan_in_store.join('、')
            }}（默认保留；需显式勾选「清理孤儿标的」才删）
          </template>
        </div>
      </div>
    </SyncTaskPanel>
  </NCard>
</template>
