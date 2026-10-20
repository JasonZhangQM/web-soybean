<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useMessage } from 'naive-ui';
import {
  startBatchSync,
  fetchLatestSyncTask,
  fetchSyncTask,
  stopBatchSync,
  startIndexConstituentSync,
  fetchIndexConstituentSyncStatus,
  type BatchSyncRequest,
  type IndexConstituentSyncRequest
} from '@/service/api';
import { useBdsStore } from '@/store/modules/bds';
import MacroSyncCard from './modules/macro-sync-card.vue';

defineOptions({ name: 'BatchSyncPage' });

const message = useMessage();
const bdsStore = useBdsStore();

// ===================== 共用：指数下拉 / 行业下拉 =====================

const indexCodeOptions = computed(() => bdsStore.getIndexCodeOptions());
const industryOptions = computed(() => bdsStore.getIndustryOptions());

// 可同步指数（gm 支持）
const syncableIndexOptions = computed(() =>
  bdsStore.indexCodeList
    .filter(item => item.gm_supported !== false)
    .map(item => ({ label: item.sec_name, value: item.code }))
);

// ===================== 卡片 1：财务及行情批量同步 =====================

const TABLE_OPTIONS = [
  { label: '资产负债表', value: 'fund-balance' },
  { label: '利润表', value: 'fund-income' },
  { label: '现金流量表', value: 'fund-cashflow' },
  { label: '财务指标', value: 'finance-deriv' },
  { label: '每日估值', value: 'daily-valuation' },
  { label: '每日市值', value: 'daily-mktvalue' }
];

const scopeOptions = [
  { label: '全市场', value: 'all' },
  { label: '指数成分股', value: 'index' },
  { label: '指定行业', value: 'industry' },
  { label: '手写清单', value: 'explicit' }
];

/**
 * 退市口径（三态）
 * 仅作用于 全市场 / 指数成分股 / 指定行业 三个范围；
 * 手写清单 = 用户显式意图，系统不做二次过滤（下拉在该范围下禁用）
 */
const TRADING_STATUS_OPTIONS = [
  { label: '仅在市', value: 'trading' },
  { label: '仅退市', value: 'delisted' },
  { label: '全部', value: 'all' }
];

/** 解析同步表记忆值：无记忆→全选；用户主动清空→沿用空；全部失效→回落全选 */
function resolveTables(stored: string[] | undefined) {
  const tableValues = TABLE_OPTIONS.map(o => o.value);
  if (!stored) return tableValues;
  if (stored.length === 0) return [];
  const kept = stored.filter(t => tableValues.includes(t));
  return kept.length > 0 ? kept : tableValues;
}

/** 跳过已同步的日期不允许选未来：未来日期下没有任何 sync_at，等价于不跳过，容易误解 */
function disabledFutureDate(ts: number) {
  return ts > Date.now();
}

/** 构造初始表单：有记忆则沿用（含校验），否则用默认值 */
function buildInitialForm() {
  const stored = bdsStore.batchSyncForm;
  const scopeValues = scopeOptions.map(o => o.value);
  const tsValues = TRADING_STATUS_OPTIONS.map(o => o.value);
  return {
    scope: stored && scopeValues.includes(stored.scope) ? stored.scope : 'all',
    index_code: stored?.index_code ?? '',
    industry: stored?.industry ?? '',
    symbols: stored?.symbols ?? '',
    tables: resolveTables(stored?.tables),
    mark_synced: stored?.mark_synced ?? true,
    // 会话内存里可能残留旧的 boolean 值，只接受字符串日期
    exclude_synced_since: typeof stored?.exclude_synced_since === 'string' ? stored.exclude_synced_since : null,
    trading_status: stored && tsValues.includes(stored.trading_status) ? stored.trading_status : 'trading',
    max_symbols: stored?.max_symbols ?? 0
  };
}

const form = reactive(buildInitialForm());

// 表单任何变化即写回 store（会话内保持；不落 localStorage）
watch(form, val => bdsStore.setBatchSyncForm({ ...val }), { deep: true });

/** 同步表全选 / 清空 */
function selectAllTables() {
  form.tables = TABLE_OPTIONS.map(o => o.value);
}
function clearTables() {
  form.tables = [];
}

const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));
const errorList = computed(() => task.value?.errors || []);

const scopeLabelMap: Record<string, string> = {
  all: '全市场',
  index: '指数成分股',
  industry: '指定行业',
  explicit: '手写清单'
};
const scopeExtraLabel = computed(() => {
  if (!task.value?.scope_params) return '';
  const p = task.value.scope_params as Record<string, unknown>;
  if (p.index_code) return `· ${p.index_code}`;
  if (p.industry) return `· ${p.industry}`;
  if (Array.isArray(p.symbols)) return `· ${p.symbols.length} 只`;
  return '';
});

const statusLabel = computed(() => {
  const map: Record<string, { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
    pending: { text: '等待中', type: 'default' },
    running: { text: '运行中', type: 'info' },
    done: { text: '已完成', type: 'success' },
    failed: { text: '失败', type: 'error' },
    stopped: { text: '已停止', type: 'warning' }
  };
  return map[task.value?.status || ''] || { text: '-', type: 'default' };
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function handleStart() {
  if (form.scope === 'index' && !form.index_code) {
    message.warning('请选择指数代码');
    return;
  }
  if (form.scope === 'industry' && !form.industry) {
    message.warning('请选择行业');
    return;
  }
  if (form.scope === 'explicit' && !form.symbols.trim()) {
    message.warning('请输入股票代码清单');
    return;
  }
  if (form.tables.length === 0) {
    message.warning('请至少选择一张同步表');
    return;
  }

  starting.value = true;
  try {
    const payload: BatchSyncRequest = {
      scope: form.scope,
      tables: form.tables,
      mark_synced: form.mark_synced,
      exclude_synced_since: form.exclude_synced_since,
      trading_status: form.trading_status as BatchSyncRequest['trading_status'],
      max_symbols: form.max_symbols
    };
    if (form.scope === 'index') payload.index_code = form.index_code;
    if (form.scope === 'industry') payload.industry = form.industry;
    if (form.scope === 'explicit') {
      payload.symbols = form.symbols.split(/[\s,，]+/).filter(Boolean);
    }
    const { data, error } = await startBatchSync(payload);
    if (error) {
      message.error(error.message || '启动失败');
      return;
    }
    message.success(`已启动任务 #${data.id}`);
    await loadBatchTask(data.id);
    startPolling();
  } finally {
    starting.value = false;
  }
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
  } finally {
    stopping.value = false;
    if (task.value) await loadBatchTask(task.value.id);
  }
}

/**
 * 运行中：用任务参数回填表单（锁定显示，避免用户误以为改了就生效）
 *
 * ⚠️ 除 index_code / industry_name / symbols 外，其余参数都是 bds_sync_task 的
 *    **独立列**、不在 scope_params JSON 里。此前误从 scope_params 读取 ⇒
 *    typeof 判断恒为 false ⇒ 运行中回填从未生效（已改为读 task 列）。
 */
function fillFormFromTask(data: Api.Bds.SyncTask) {
  const p = (data.scope_params || {}) as Record<string, unknown>;
  form.scope = data.scope as typeof form.scope;
  form.index_code = (p.index_code as string) || '';
  form.industry = (p.industry_name as string) || (p.industry as string) || '';
  form.symbols = Array.isArray(p.symbols) ? (p.symbols as string[]).join(',') : '';
  if (Array.isArray(data.tables) && data.tables.length > 0) form.tables = data.tables as typeof form.tables;
  form.mark_synced = data.mark_synced === 1;
  form.exclude_synced_since = data.exclude_synced_since ?? null;
  form.max_symbols = data.max_symbols;
  form.trading_status = data.trading_status || 'trading';
}

async function loadBatchTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (!error && data) {
      // 只接管非 index_backfill 的任务
      if (data.scope === 'index_backfill') return;
      task.value = data;

      // 运行中锁定 form 显示
      if (isRunning.value) fillFormFromTask(data);

      if (!isRunning.value) stopPolling();
    }
  } catch {
    // 404 忽略
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (task.value) loadBatchTask(task.value.id);
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const errorColumns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '表', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];

// ===================== 卡片 2：指数成分股同步 =====================

// 默认不勾选上证指数：gm 该指数的成分股数据只到 2000-06-02，本地历史也已删除，
// 按日增量同步纯属空跑。需要时仍可手动勾选（清单里保留该项）。
const DEFAULT_SKIP_INDEX_CODES = ['SHSE.000001'];

/** 今日（本地时区）YYYY-MM-DD。起始日期默认当日 ⇒ 日常只需点启动，只同步今天 */
const todayStr = new Date().toLocaleDateString('sv-SE');

// 与卡片 1「同步表选择」同构：选择项收进一个 reactive 表单（默认值只在初始化/首次加载时给一次）
const indexForm = reactive<{ index_codes: string[]; start_date: string | null }>({
  index_codes: [],
  start_date: todayStr
});

// 勾选变化写回 store：会话内保持（切页/重进沿用），不落 localStorage
watch(
  () => indexForm.index_codes,
  val => {
    bdsStore.setSelectedIndexCodes(val);
  },
  { deep: true }
);

/** 解析指数记忆值：无记忆→全选（剔除默认跳过项）；用户主动清空→沿用空；全部失效→回落默认 */
function resolveIndexCodes(stored: string[] | null) {
  const allSyncable = syncableIndexOptions.value.map(option => option.value);
  const defaults = allSyncable.filter(code => !DEFAULT_SKIP_INDEX_CODES.includes(code));
  if (!stored) return defaults;
  if (stored.length === 0) return [];
  // 记忆里显式勾过的指数一律尊重（含上证指数），只剔除已不可同步的
  const kept = stored.filter(code => allSyncable.includes(code));
  return kept.length > 0 ? kept : defaults;
}

/** 全选：跳过默认不勾的指数（上证指数需要时手动勾） */
function selectAllIndices() {
  indexForm.index_codes = syncableIndexOptions.value
    .map(option => option.value)
    .filter(code => !DEFAULT_SKIP_INDEX_CODES.includes(code));
}

/** 清空勾选 */
function clearIndices() {
  indexForm.index_codes = [];
}

const indexStarting = ref(false);
const indexStopping = ref(false);
const indexTask = ref<Api.Bds.SyncTask | null>(null);

// 成分核查水位（P0-0）：名单自 X 未变 ≠ 已核查到 X，两者必须分开看
const indexWm = ref<Api.Bds.IndexConstituentSyncStatus[]>([]);

async function loadIndexWatermark() {
  const { data, error } = await fetchIndexConstituentSyncStatus();
  if (!error) indexWm.value = data?.items || [];
}

/** 水位摘要文案：正常「名单自 X · 核查至 Y」，有缺口/脏数据时加后缀 */
function wmText(item: Api.Bds.IndexConstituentSyncStatus) {
  const base = `名单自 ${item.last_change_date || '-'} · 核查至 ${item.checked_to || '-'}`;
  if (item.current_rows === 0) return `${base}（表内 0 行，需清理水位）`;
  const extra: string[] = [];
  if (item.gap_days > 0) extra.push(`${item.gap_days} 天未确认，自 ${item.first_gap || '-'}`);
  // 脏日 = gm 返回的名单只数异常被拒存（疑伪快照），该日成分回退到上一个干净名单
  if (item.dirty_days > 0) extra.push(`${item.dirty_days} 天拒存，自 ${item.first_dirty || '-'}`);
  return extra.length ? `${base}（${extra.join('；')}）` : base;
}

/** 水位异常判定：成分行被删 / 有未确认日 / 有被拒存的伪快照 */
function wmAbnormal(item: Api.Bds.IndexConstituentSyncStatus) {
  return item.current_rows === 0 || item.gap_days > 0 || item.dirty_days > 0;
}

const indexIsRunning = computed(() => indexTask.value?.status === 'running' || indexTask.value?.status === 'pending');
const indexProgressValue = computed(() => Number(indexTask.value?.progress || 0));
const indexErrorList = computed(() => indexTask.value?.errors || []);

const indexStatusLabel = computed(() => {
  const map: Record<string, { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
    pending: { text: '等待中', type: 'default' },
    running: { text: '运行中', type: 'info' },
    done: { text: '已完成', type: 'success' },
    failed: { text: '失败', type: 'error' },
    stopped: { text: '已停止', type: 'warning' }
  };
  return map[indexTask.value?.status || ''] || { text: '-', type: 'default' };
});

const taskIndexCodes = computed<string[]>(() => indexTask.value?.scope_params?.index_codes || []);
const taskStartDate = computed<string | null>(() => indexTask.value?.scope_params?.start_date || null);

let indexPollTimer: ReturnType<typeof setInterval> | null = null;

async function handleIndexStart() {
  if (indexForm.index_codes.length === 0) {
    message.warning('请至少选择一个指数');
    return;
  }

  indexStarting.value = true;
  try {
    const payload: IndexConstituentSyncRequest = { index_codes: [...indexForm.index_codes] };
    if (indexForm.start_date) payload.start_date = indexForm.start_date;
    const { data, error } = await startIndexConstituentSync(payload);
    if (error) {
      message.error(error.message || '启动失败');
      return;
    }
    message.success(`已启动任务 #${data.id}`);
    await loadIndexTask(data.id);
    startIndexPolling();
  } finally {
    indexStarting.value = false;
  }
}

async function handleIndexStop() {
  if (!indexTask.value) return;
  indexStopping.value = true;
  try {
    const { data, error } = await stopBatchSync(indexTask.value.id);
    if (error) {
      message.error(error.message || '停止失败');
      return;
    }
    message.info(data?.message || '停止信号已发出');
  } finally {
    indexStopping.value = false;
    if (indexTask.value) await loadIndexTask(indexTask.value.id);
  }
}

/** 运行中锁定表单显示：用任务参数回填勾选与起始日期（对齐卡片 1 的做法） */
function fillIndexFormFromTask(data: Api.Bds.SyncTask) {
  const p = (data.scope_params || {}) as Record<string, unknown>;
  if (Array.isArray(p.index_codes)) indexForm.index_codes = p.index_codes as string[];
  indexForm.start_date = (p.start_date as string) || null;
}

async function loadIndexTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (!error && data) {
      // 只接管 index_backfill 的任务
      if (data.scope !== 'index_backfill') return;
      indexTask.value = data;

      // 运行中回填表单，保证「任务 ↔ 显示」一致
      if (indexIsRunning.value) fillIndexFormFromTask(data);

      if (!indexIsRunning.value) {
        stopIndexPolling();
        // 任务结束刷新水位：checked_to 推进是本卡片的核心可见反馈
        loadIndexWatermark();
      }
    }
  } catch {
    // 404 忽略
  }
}

function startIndexPolling() {
  stopIndexPolling();
  indexPollTimer = setInterval(() => {
    if (indexTask.value) loadIndexTask(indexTask.value.id);
  }, 5000);
}

function stopIndexPolling() {
  if (indexPollTimer) {
    clearInterval(indexPollTimer);
    indexPollTimer = null;
  }
}

const indexErrorColumns = [
  { title: '指数', key: 'symbol', width: 130 },
  { title: '数据', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];

// ===================== 初始化 =====================

onMounted(async () => {
  await bdsStore.loadIndexCodes();
  await bdsStore.loadIndustries();
  // 卡片 3：取动态数量文案 + 结果表 code→name 映射
  await bdsStore.loadDailyIndicatorCodes(true);
  await bdsStore.loadGoldReserveCountries(true);

  // 卡片 2 维持选择：store 有记录则沿用（剔除已不可同步的指数），无记录则默认全选
  indexForm.index_codes = resolveIndexCodes(bdsStore.selectedIndexCodes);
  loadIndexWatermark();

  // fetchLatestSyncTask 只返回最新一条，根据 scope 分派
  const { data, error } = await fetchLatestSyncTask();
  if (!error && data) {
    if (data.scope === 'index_backfill') {
      indexTask.value = data;
      if (indexIsRunning.value) {
        // 运行中：任务参数优先于默认/记忆的勾选
        fillIndexFormFromTask(data);
        startIndexPolling();
      }
    } else {
      task.value = data;
      // 运行中锁定 form
      if (isRunning.value) {
        fillFormFromTask(data);
        startPolling();
      }
    }
  }
});

onBeforeUnmount(() => {
  stopPolling();
  stopIndexPolling();
});
</script>

<template>
  <div class="p-16px">
    <!-- ===== 卡片 1：财务及行情批量同步 ===== -->
    <NCard size="small">
      <template #header>
        <NSpace align="center" :size="12">
          <span>财务及行情批量同步</span>
          <NButton type="primary" size="small" :loading="starting" :disabled="isRunning" @click="handleStart">
            启动
          </NButton>
          <NButton v-if="isRunning" type="error" ghost size="small" :loading="stopping" @click="handleStop">
            停止
          </NButton>
        </NSpace>
      </template>

      <NForm inline label-placement="left" :show-feedback="false" :disabled="isRunning">
        <!-- 第一行：同步范围 + 条件项（指数/行业/清单，三选一） -->
        <NFormItem label="同步范围" label-width="80px">
          <NSelect v-model:value="form.scope" :options="scopeOptions" style="width: 130px" />
        </NFormItem>
        <NFormItem v-if="form.scope === 'index'" label="指数代码" label-width="70px">
          <NSelect
            v-model:value="form.index_code"
            :options="indexCodeOptions"
            placeholder="选择指数"
            filterable
            style="width: 180px"
          />
        </NFormItem>
        <NFormItem v-if="form.scope === 'industry'" label="行业" label-width="56px">
          <NSelect
            v-model:value="form.industry"
            :options="industryOptions"
            placeholder="选择行业"
            filterable
            style="width: 180px"
          />
        </NFormItem>
        <NFormItem v-if="form.scope === 'explicit'" label="代码清单" label-width="70px">
          <NInput v-model:value="form.symbols" placeholder="空格或逗号分隔" style="width: 260px" />
        </NFormItem>
      </NForm>

      <!-- 同步表 checkbox -->
      <div style="margin-top: 8px; display: flex; align-items: center; gap: 16px">
        <span style="font-size: 13px; color: #666; flex-shrink: 0">同步表：</span>
        <NCheckboxGroup v-model:value="form.tables" :disabled="isRunning" style="flex: 1">
          <NSpace :size="12" :wrap="true">
            <NCheckbox v-for="opt in TABLE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
        <NButton size="tiny" secondary :disabled="isRunning" @click="selectAllTables">全选</NButton>
        <NButton size="tiny" secondary :disabled="isRunning" @click="clearTables">清空</NButton>
      </div>

      <!-- 可选参数 -->
      <NForm inline label-placement="left" :show-feedback="false" :disabled="isRunning" style="margin-top: 8px">
        <NFormItem label="退市口径" label-width="80px">
          <NSelect
            v-model:value="form.trading_status"
            :options="TRADING_STATUS_OPTIONS"
            :disabled="form.scope === 'explicit'"
            style="width: 110px"
          />
          <!--
 <span style="margin-left: 6px; font-size: 12px; color: #999">
            {{
              form.scope === 'explicit'
                ? '手写清单不受此条件约束'
                : '仅作用于全市场/指数成分/行业（且只取 A 股个股，不含指数）'
            }}
          </span> 
-->
        </NFormItem>
        <NFormItem label="最多标的" label-width="80px">
          <NInputNumber v-model:value="form.max_symbols" :min="0" placeholder="0=不限" style="width: 120px" />
        </NFormItem>
        <NFormItem label="标记同步" label-width="80px">
          <NSwitch v-model:value="form.mark_synced" />
          <!-- <span style="margin-left: 6px; font-size: 12px; color: #999">写 sync_at</span> -->
        </NFormItem>
        <NFormItem label="跳过已同步" label-width="110px">
          <NDatePicker
            v-model:formatted-value="form.exclude_synced_since"
            type="date"
            value-format="yyyy-MM-dd"
            clearable
            :is-date-disabled="disabledFutureDate"
            placeholder="不跳过"
            style="width: 160px"
          />
          <!--
 <span style="margin-left: 8px; font-size: 12px; color: #999">
            剔除 sync_at ≥ 所选日期的代码；选今天=只跑今日未同步，选昨天=接着昨天进度续跑
          </span> 
-->
        </NFormItem>
      </NForm>

      <!-- 进度面板 -->
      <div v-if="task" style="margin-top: 20px">
        <NSpace align="center">
          <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
          <span style="font-size: 13px; color: #666">
            任务 #{{ task.id }} · {{ scopeLabelMap[task.scope] || task.scope }}{{ scopeExtraLabel }}
          </span>
        </NSpace>
        <NProgress
          type="line"
          :percentage="progressValue"
          :show-indicator="true"
          :indicator-width="38"
          :status="task.status === 'failed' ? 'error' : task.status === 'done' ? 'success' : 'default'"
          style="margin-top: 12px"
        />
        <NGrid :cols="4" :x-gap="12" style="margin-top: 8px">
          <NGridItem>
            <NStatistic label="已完成 / 总数" :value="`${task.done_count} / ${task.total_count}`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="success" :value="task.success_count" value-style="color: #18a058" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="no_data" :value="task.no_data_count" value-style="color: #999" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="error" :value="task.error_count" value-style="color: #d03050" />
          </NGridItem>
        </NGrid>

        <NCollapse v-if="!isRunning && errorList.length > 0" style="margin-top: 12px">
          <NCollapseItem :title="`失败明细（${errorList.length}）`" name="errors">
            <NDataTable :columns="errorColumns" :data="errorList" :bordered="false" size="small" :max-height="240" />
          </NCollapseItem>
        </NCollapse>
        <div v-else-if="!isRunning && task.status === 'done'" style="color: #18a058; font-size: 13px; margin-top: 12px">
          全部完成，无失败项
        </div>
      </div>
    </NCard>

    <!-- ===== 卡片 2：指数成分股同步 ===== -->
    <NCard size="small" style="margin-top: 16px">
      <template #header>
        <NSpace align="center" :size="12">
          <span>指数成分股同步</span>
          <NButton
            type="primary"
            size="small"
            :loading="indexStarting"
            :disabled="indexIsRunning"
            @click="handleIndexStart"
          >
            启动
          </NButton>
          <NButton
            v-if="indexIsRunning"
            type="error"
            ghost
            size="small"
            :loading="indexStopping"
            @click="handleIndexStop"
          >
            停止
          </NButton>
        </NSpace>
      </template>

      <!-- 指数选择：checkbox 组（参照财务及行情批量同步"同步表"样式） -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '16px', opacity: indexIsRunning ? 0.6 : 1 }">
        <span style="font-size: 13px; color: #666; flex-shrink: 0">指数：</span>
        <NCheckboxGroup v-model:value="indexForm.index_codes" :disabled="indexIsRunning" style="flex: 1">
          <NSpace :size="12" :wrap="true">
            <NCheckbox v-for="opt in syncableIndexOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
        <NButton size="tiny" secondary :disabled="indexIsRunning" @click="selectAllIndices">全选</NButton>
        <NButton size="tiny" secondary :disabled="indexIsRunning" @click="clearIndices">清空</NButton>
      </div>

      <!-- 起始日期 -->
      <div
        :style="{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          opacity: indexIsRunning ? 0.6 : 1
        }"
      >
        <span style="font-size: 13px; color: #666; flex-shrink: 0">起始日期：</span>
        <NDatePicker
          v-model:formatted-value="indexForm.start_date"
          :disabled="indexIsRunning"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          placeholder="清空 = 从核查水位次日增量"
          style="width: 210px"
        />
      </div>

      <!-- 核查水位（P0-0）：名单自 X 未变 ≠ 已核查到 X，两者必须分开看 -->
      <div v-if="indexWm.length" style="margin-top: 12px">
        <div style="font-size: 13px; color: #666; margin-bottom: 6px">
          核查水位
          <span style="font-size: 12px; color: #999; margin-left: 8px">
            「核查至」= 已判定过的最后交易日；「名单自」= 该期间名单确实没变。增量从「核查至」次日接着跑。
          </span>
        </div>
        <NSpace :size="[16, 6]" :wrap="true">
          <NTag
            v-for="item in indexWm"
            :key="item.index_code"
            size="small"
            :bordered="false"
            :type="wmAbnormal(item) ? (item.current_rows === 0 ? 'error' : 'warning') : 'default'"
          >
            {{ item.sec_name || item.index_code }}：{{ wmText(item) }}
          </NTag>
        </NSpace>
      </div>

      <div style="margin-top: 8px; font-size: 12px; color: #999">
        起始日期留空 =
        各指数从「核查至」次日增量；要做历史回填请手动改成更早日期（水位不回退）。仅在成分股名单发生变化的交易日留存快照（不存每日权重）；已存交易日自动跳过，中断后重跑可续补。
      </div>

      <!-- 进度面板 -->
      <div v-if="indexTask" style="margin-top: 20px">
        <NSpace align="center">
          <NTag :type="indexStatusLabel.type" round>{{ indexStatusLabel.text }}</NTag>
          <span style="font-size: 13px; color: #666">
            任务 #{{ indexTask.id }} · {{ taskIndexCodes.length }} 只指数 · 起始 {{ taskStartDate || '增量' }}
          </span>
        </NSpace>
        <NProgress
          type="line"
          :percentage="indexProgressValue"
          :show-indicator="true"
          :indicator-width="38"
          :status="indexTask.status === 'failed' ? 'error' : indexTask.status === 'done' ? 'success' : 'default'"
          style="margin-top: 12px"
        />
        <NGrid :cols="7" :x-gap="12" style="margin-top: 8px">
          <NGridItem>
            <NStatistic label="已完成 / 总数" :value="`${indexTask.done_count} / ${indexTask.total_count}`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="留存快照" :value="indexTask.success_count" value-style="color: #18a058" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="跳过" :value="indexTask.skipped_count" value-style="color: #666" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="无数据" :value="indexTask.no_data_count" value-style="color: #999" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="失败" :value="indexTask.error_count" value-style="color: #d03050" />
          </NGridItem>
          <NGridItem>
            <NStatistic
              label="拒存"
              :value="indexTask.dirty_count"
              :value-style="indexTask.dirty_count > 0 ? 'color: #f0a020' : 'color: #999'"
            />
          </NGridItem>
          <NGridItem>
            <NStatistic
              label="中止指数"
              :value="indexTask.aborted_count"
              :value-style="indexTask.aborted_count > 0 ? 'color: #f0a020' : 'color: #999'"
            />
          </NGridItem>
        </NGrid>
        <div style="margin-top: 4px; font-size: 12px; color: #999">
          跳过 = 名单未变或该日已存；拒存 = 只数校验不通过（疑 gm 伪快照，当日回退上一份干净名单）；中止 =
          被停止或连续失败超限的指数个数。
        </div>

        <NCollapse v-if="!indexIsRunning && indexErrorList.length > 0" style="margin-top: 12px">
          <NCollapseItem :title="`失败明细（${indexErrorList.length}）`" name="indexErrors">
            <NDataTable
              :columns="indexErrorColumns"
              :data="indexErrorList"
              :bordered="false"
              size="small"
              :max-height="240"
            />
          </NCollapseItem>
        </NCollapse>
        <div
          v-else-if="!indexIsRunning && indexTask.status === 'done'"
          style="color: #18a058; font-size: 13px; margin-top: 12px"
        >
          全部完成，无失败项
        </div>
      </div>
    </NCard>

    <!-- ===== 卡片 3：宏观数据同步（三个宏观页面的同步入口集中处） ===== -->
    <MacroSyncCard />
  </div>
</template>
