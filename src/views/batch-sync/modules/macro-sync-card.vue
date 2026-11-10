<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchLatestSyncTask, fetchSyncTask, startMacroSync, startBillsImportTask, stopBatchSync } from '@/service/api';

defineOptions({ name: 'MacroSyncCard' });

const message = useMessage();

// ===================== 段定义 =====================

/** 九个同步段；其中交易明细导入是 bills 模块的独立后台任务（scope='bills_import'），
 *  其余八段由后端固定为 trade_date → symbol_info → history_market → option_info → option_market → wscn → daily → gold */
type StageKey =
  | 'trade_date'
  | 'symbol_info'
  | 'history_market'
  | 'option_info'
  | 'option_market'
  | 'bills_import'
  | 'wscn'
  | 'daily'
  | 'gold';

interface StageOption {
  label: string;
  value: StageKey;
}

/** 勾选分组（组内顺序 = 后端执行顺序）：基础数据是下游依赖，排在宏观之前 */
const STAGE_GROUPS: Array<{ name: string; options: StageOption[] }> = [
  {
    name: '基础数据',
    options: [
      { label: '交易日历', value: 'trade_date' },
      { label: '证券信息', value: 'symbol_info' },
      { label: '历史行情', value: 'history_market' },
      // 🔴 必须排在「期权行情」之前：行情同步要从字典取逐合约乘数与权威到期日，
      // 当天新挂牌的合约若还没进字典就会被跳过（后端也固定这个顺序）
      { label: '期权合约字典', value: 'option_info' },
      { label: '期权行情', value: 'option_market' },
      // 交易明细导入（bills 12 步流水线）：与其他段不同，它跑的是 bills 自己的
      // 后台任务端点，且因全局互斥只能串联排队——见 handleStart 的分流逻辑
      { label: '交易明细导入', value: 'bills_import' }
    ]
  },
  {
    name: '宏观数据',
    options: [
      { label: '经济指标（华尔街见闻）', value: 'wscn' },
      { label: '美债收益率（FRED）', value: 'daily' },
      { label: '黄金储备（IMF）', value: 'gold' }
    ]
  }
];

const STAGE_OPTIONS: StageOption[] = STAGE_GROUPS.flatMap(g => g.options);

/** 同步段 → 数据查看页链接（checkbox 文字后的 ↗，点击跳转不触发勾选） */
const STAGE_LINKS: Record<StageKey, string> = {
  trade_date: '/bds/trade-dates',
  symbol_info: '/bds/symbol-infos',
  history_market: '/bds/market-data/history-markets',
  option_info: '/bds/option-info',
  option_market: '/bds/market-data/option-market',
  bills_import: '/bills/bills',
  wscn: '/bds/macro-research/economic-indicators',
  daily: '/bds/macro-research/daily-indicators',
  gold: '/bds/macro-research/gold-reserves'
};

/**
 * 默认勾选六段。
 * - 不勾「交易日历」：insert_trade_date_em_sql 只在跨年时才真写库，一年手动跑一次足够
 * - 不勾「黄金储备」：IMF SDMX 接口（dataservices.imf.org）当前 502，20 国 × 约 16s ≈ 5.5 分钟
 *   且必然 20 项全失败（bds_gold_reserve 至今 0 行），默认勾上等于每次启动都白等
 * - 勾「期权合约字典」：一次 HTTP + 25,910 行 UPSERT，实测 16~20s；它是「期权行情」的上游
 * - 勾「期权行情」：3 组约 5s，属于每日都要更新的行情数据，代价可接受
 * - 不勾「交易明细导入」：12 步重度流水线（读账单 Excel + 抓实时市值），只在有新账单
 *   入库后按需勾选，避免每日一键同步都白跑一遍全量重算
 */
const DEFAULT_STAGES: StageKey[] = ['symbol_info', 'history_market', 'option_info', 'option_market', 'wscn', 'daily'];

const selectedStages = ref<StageKey[]>([...DEFAULT_STAGES]);

/** 全选：勾选全部同步段（全选 = 全部 9 段，默认不勾的交易日历/黄金储备/交易明细导入也包含在内） */
function selectAllStages() {
  selectedStages.value = STAGE_OPTIONS.map(o => o.value);
}

/** 清空勾选 */
function clearStages() {
  selectedStages.value = [];
}

// ===================== 任务状态 =====================

const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

/**
 * 串联排队标记：「交易明细导入」与其他段同时勾选时，先跑宏观任务，
 * 结束后由 loadTask 自动接跑导入任务（两任务是不同后端端点、共用任务表全局互斥）。
 * ⚠️ 排队是前端行为：任务本身关页面照常执行，但自动接跑需要本页存活（刷新即失效）
 */
const queuedBillsImport = ref(false);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));
const errorList = computed(() => task.value?.errors || []);

/** 段摘要（来自后端 result.stages，逐项累计） */
interface StageStat {
  key: StageKey;
  name: string;
  /** basic / macro，后端 SYNC_STAGE_GROUPS 给的值 */
  group?: string;
  total: number;
  done: number;
  ok: number;
  no_data: number;
  error: number;
  rows: number;
}

const stageStats = computed<StageStat[]>(() => {
  const raw = (task.value?.result as Record<string, unknown> | null | undefined)?.stages;
  return Array.isArray(raw) ? (raw as StageStat[]) : [];
});

/** 当前在跑哪一段哪一项 —— wscn 首轮全量时进度条会停在该段，这是唯一的"在动"证据 */
const currentStageText = computed(() => {
  if (!isRunning.value) return '';
  const cur = (task.value?.result as Record<string, unknown> | null | undefined)?.stage as StageKey | undefined;
  const hit = stageStats.value.find(i => i.key === cur);
  return hit ? `${hit.name} ${hit.done}/${hit.total}` : '';
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

/** 任务描述：跑了几段 · 共几项 */
const taskMeta = computed(() => {
  if (!task.value) return '';
  const p = (task.value.scope_params || {}) as Record<string, unknown>;
  const stages = Array.isArray(p.stages) ? (p.stages as string[]) : [];
  const names = stages.map(k => STAGE_OPTIONS.find(o => o.value === k)?.label || k);
  return `${names.length ? names.join(' → ') : '—'} · 共 ${task.value.total_count} 项`;
});

// ===================== 段摘要表 =====================

const stageColumns = [
  { title: '段', key: 'name', width: 200 },
  {
    title: '进度',
    key: 'done',
    width: 90,
    render: (row: StageStat) => `${row.done}/${row.total}`
  },
  { title: '成功', key: 'ok', width: 70 },
  { title: '无数据', key: 'no_data', width: 80 },
  {
    title: '失败',
    key: 'error',
    width: 70,
    render: (row: StageStat) => (row.error > 0 ? row.error : '—')
  },
  { title: '条数合计', key: 'rows', width: 100 },
  {
    title: '状态',
    key: 'state',
    render: (row: StageStat) => {
      if (row.total === 0) return '—';
      if (row.done < row.total) return row.done === 0 ? '未开始' : '进行中';
      if (row.error > 0) return '有失败';
      return '已完成';
    }
  }
];

const errorColumns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '段', key: 'table', width: 200 },
  { title: '错误信息', key: 'message' }
];

// ===================== 轮询 =====================

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function loadTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (!error && data) {
      // 只接管本卡片的两类任务：latest 可能返回批量同步/成分股/估值任务，抢过来会把别的卡片挤掉
      if (data.scope !== 'macro_sync' && data.scope !== 'bills_import') return;
      task.value = data;

      // 运行中用任务参数回填勾选，避免"显示跑了 3 段、勾选只有 2 段"的错位
      if (isRunning.value) {
        const st = ((data.scope_params || {}) as Record<string, unknown>).stages;
        if (Array.isArray(st) && st.length > 0) selectedStages.value = st as StageKey[];
      } else {
        stopPolling();
        // 串联排队：宏观任务结束后自动接跑交易明细导入；手动停止视为撤销排队
        if (queuedBillsImport.value) {
          queuedBillsImport.value = false;
          if (data.scope === 'macro_sync' && data.status !== 'stopped') {
            message.info('宏观同步结束，自动接跑交易明细导入');
            await startImportTask();
          }
        }
      }
    }
  } catch {
    // 404（无任务）忽略
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (task.value) loadTask(task.value.id);
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===================== 操作 =====================

/** 启动交易明细导入后台任务（bills 端点），接管任务卡显示并继续轮询 */
async function startImportTask() {
  const { data, error } = await startBillsImportTask();
  if (error) {
    message.error(error.message || '启动交易明细导入失败');
    return;
  }
  message.success(`已启动交易明细导入任务 #${data.id}`);
  task.value = data;
  startPolling();
}

async function handleStart() {
  if (selectedStages.value.length === 0) {
    message.warning('请至少选择一个同步段');
    return;
  }
  starting.value = true;
  try {
    // 交易明细导入走 bills 自己的任务端点，不能混进 startMacroSync 的 stages（后端 400 未知段）
    const billsImport = selectedStages.value.includes('bills_import');
    const macroStages = selectedStages.value.filter(s => s !== 'bills_import');

    if (macroStages.length > 0) {
      // 同时勾了两类：先启动宏观任务并记下排队，结束后自动接跑导入
      queuedBillsImport.value = billsImport;
      const { data, error } = await startMacroSync({ stages: macroStages });
      if (error) {
        message.error(error.message || '启动失败');
        queuedBillsImport.value = false;
        return;
      }
      message.success(`已启动任务 #${data.id}${billsImport ? '，完成后将自动接跑交易明细导入' : ''}`);
      await loadTask(data.id);
      startPolling();
    } else {
      // 只勾了交易明细导入：直接启动导入任务
      await startImportTask();
    }
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
    if (task.value) await loadTask(task.value.id);
  }
}

// ===================== 初始化 =====================

onMounted(async () => {
  const { data, error } = await fetchLatestSyncTask();
  // 宏观任务（macro_sync）与导入任务（bills_import）都归本卡片接管
  if (!error && data && (data.scope === 'macro_sync' || data.scope === 'bills_import')) {
    task.value = data;
    if (isRunning.value) {
      const st = ((data.scope_params || {}) as Record<string, unknown>).stages;
      if (Array.isArray(st) && st.length > 0) selectedStages.value = st as StageKey[];
      startPolling();
    }
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <NCard size="small" class="bds-sync-card">
    <template #header>宏观与基础数据同步</template>
    <template #header-extra>
      <NButton size="small" :loading="starting" :disabled="isRunning" @click="handleStart">启动</NButton>
      <NButton v-if="isRunning" size="small" :loading="stopping" @click="handleStop">停止</NButton>
    </template>

    <!-- 段选择：分「基础数据 / 宏观数据」两组，组内与跨组顺序即后端执行顺序 -->
    <div style="display: flex; gap: 16px; align-items: flex-start">
      <span style="font-size: 13px; color: #666; flex-shrink: 0; line-height: 24px">同步段：</span>
      <NCheckboxGroup v-model:value="selectedStages" :disabled="isRunning" style="flex: 1">
        <div
          v-for="g in STAGE_GROUPS"
          :key="g.name"
          style="display: flex; align-items: flex-start; gap: 12px; line-height: 24px"
        >
          <span style="font-size: 12px; color: #999; width: 56px; flex-shrink: 0">{{ g.name }}</span>
          <NSpace :size="16" :wrap="true">
            <NCheckbox v-for="opt in g.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
              <RouterLink :to="STAGE_LINKS[opt.value]" class="sync-link" @click.stop>↗</RouterLink>
            </NCheckbox>
          </NSpace>
        </div>
      </NCheckboxGroup>
      <NButton size="tiny" secondary :disabled="isRunning" @click="selectAllStages">全选</NButton>
      <NButton size="tiny" secondary :disabled="isRunning" @click="clearStages">清空</NButton>
    </div>

    <div style="margin-top: 6px; font-size: 12px; color: #999; line-height: 1.6">
      固定顺序：交易日历 → 证券信息 → 指数行情 → 期权行情 → 经济指标 → 美债收益率 →
      黄金储备（基础数据在下游依赖之前，整体快→慢）；单项失败不中断，段失败不影响后续段。期权行情的范围由「期权同步清单」决定（按品种×到期月逐组拉取）。后台任务，关页面/刷新不影响执行。默认不勾交易日历（仅跨年才真写库）与黄金储备（IMF
      接口当前返回 502，勾上会白等约 5.5 分钟且 20 国全失败）。 「交易明细导入」是 bills
      的十二步流水线（任一步失败即终止流水线）；与其他段同时勾选时先跑其余段、结束后自动接跑导入（自动接跑需保持本页打开）。
      默认不勾交易明细导入：仅在有新账单入库后按需勾选。
    </div>

    <!-- 进度面板（与卡片 1 同构） -->
    <div v-if="task" style="margin-top: 16px">
      <NSpace align="center" :size="8">
        <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
        <span style="font-size: 13px; color: #666">任务 #{{ task.id }} · {{ taskMeta }}</span>
        <span v-if="currentStageText" style="font-size: 13px; color: #666">· 当前：{{ currentStageText }}</span>
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

      <!-- 分段摘要：3 行，替掉原先三张各自的结果表 -->
      <div v-if="stageStats.length > 0" style="margin-top: 12px">
        <div style="font-size: 13px; color: #666; margin-bottom: 6px">分段摘要</div>
        <NDataTable :columns="stageColumns" :data="stageStats" :bordered="false" size="small" />
      </div>

      <NCollapse v-if="!isRunning && errorList.length > 0" style="margin-top: 12px">
        <NCollapseItem :title="`失败明细（${errorList.length}）`" name="macroErrors">
          <NDataTable :columns="errorColumns" :data="errorList" :bordered="false" size="small" :max-height="240" />
        </NCollapseItem>
      </NCollapse>
      <div v-else-if="!isRunning && task.status === 'done'" style="color: #18a058; font-size: 13px; margin-top: 12px">
        全部完成，无失败项
      </div>
    </div>
  </NCard>
</template>
