<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchLatestSyncTask, fetchSyncTask, startMacroSync, startBillsImportTask, stopBatchSync } from '@/service/api';
import { runQuoteStep, type QuoteStepKey, type QuoteStepOutcome } from '@/utils/market-chain';

defineOptions({ name: 'MacroSyncCard' });

const message = useMessage();

// ===================== 段定义 =====================

/** 十一个勾选项 = 八个后端同步段 + 一个独立任务（交易明细导入）+ 两个前端行情步骤。
 *  后端八段固定为 trade_date → symbol_info → history_market → option_info → option_market → wscn → daily → gold；
 *  两个前端步骤在后端任务结束后按 标的行情 → 持仓行情 顺序执行（irs / bills 的同步 HTTP）。
 */
type StageKey =
  | 'trade_date'
  | 'symbol_info'
  | 'history_market'
  | 'option_info'
  | 'option_market'
  | 'underlying_quote'
  | 'position_quote'
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
      { label: '历史行情(指数+标的)', value: 'history_market' },
      // 🔴 必须排在「期权行情」之前：行情同步要从字典取逐合约乘数与权威到期日，
      // 当天新挂牌的合约若还没进字典就会被跳过（后端也固定这个顺序）
      { label: '期权合约字典', value: 'option_info' },
      { label: '期权行情', value: 'option_market' },
      // 两个前端行情步骤：紧跟「期权行情」勾选，但不属于后端 stages。
      // 它们在后端宏观任务结束后串行执行，各有独立进度（见 quoteProgress / runFollowups）
      { label: '标的行情', value: 'underlying_quote' },
      { label: '持仓行情', value: 'position_quote' },
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
  underlying_quote: '/irs/underlying-monitors',
  position_quote: '/bills/group-accs',
  bills_import: '/bills/bills',
  wscn: '/bds/macro-research/economic-indicators',
  daily: '/bds/macro-research/daily-indicators',
  gold: '/bds/macro-research/gold-reserves'
};

/**
 * 仅手动勾选的三段：页面默认勾选与「全选」都排除（用户 2026-11-15 要求）。
 * - 交易日历：insert_trade_date_em_sql 只在跨年时才真写库，一年手动跑一次足够
 * - 交易明细导入：bills 12 步重度流水线（读账单 Excel + 抓实时市值），只在有新账单
 *   入库后按需勾选，避免每日一键同步都白跑一遍全量重算
 * - 黄金储备：IMF SDMX 接口（dataservices.imf.org）当前 502，20 国 × 约 16s ≈ 5.5 分钟
 *   且必然 20 项全失败（bds_gold_reserve 至今 0 行），勾上等于每次启动都白等
 * 勾「期权合约字典」：一次 HTTP + 25,910 行 UPSERT，实测 16~20s，是「期权行情」的上游；
 * 勾「期权行情」：3 组约 5s，每日都要更新，代价可接受。
 * 「标的行情」「持仓行情」2026-11-16 起是独立勾选项（原先由「期权行情」隐含触发），
 * 默认仍勾上以保持日常一键同步的行为等价，各自有独立进度、失败互不阻断。
 */
const MANUAL_ONLY_STAGES: StageKey[] = ['trade_date', 'bills_import', 'gold'];

/** 两个前端行情步骤：不传给 startMacroSync（后端 stages 不认，会 400），由前端单独执行 */
const QUOTE_STEP_KEYS: QuoteStepKey[] = ['underlying_quote', 'position_quote'];

/**
 * 后端 stages 白名单 = server_fast/app/bds/router.py::SYNC_STAGE_ORDER 的八段。
 * TS 侧用类型守卫收窄，避免把新加的前端步骤断言塞给 MacroSyncRequest。
 */
const MACRO_STAGE_KEYS = [
  'trade_date',
  'symbol_info',
  'history_market',
  'option_info',
  'option_market',
  'wscn',
  'daily',
  'gold'
] as const;

type MacroStageKey = (typeof MACRO_STAGE_KEYS)[number];

function isMacroStage(s: StageKey): s is MacroStageKey {
  return (MACRO_STAGE_KEYS as readonly string[]).includes(s);
}

/** 不进后端 stages 的勾选项：由白名单取反派生，杜绝两份清单漂移 */
const NON_MACRO_STAGE_KEYS: StageKey[] = STAGE_OPTIONS.map(o => o.value).filter(s => !isMacroStage(s));

/** 常用八段：页面默认勾选 = 「全选」的结果，单一清单避免两处漂移 */
const DEFAULT_STAGES: StageKey[] = STAGE_OPTIONS.map(o => o.value).filter(v => !MANUAL_ONLY_STAGES.includes(v));

const selectedStages = ref<StageKey[]>([...DEFAULT_STAGES]);

/** 全选：只勾常用八段；交易日历 / 交易明细导入 / 黄金储备保持不勾，需要时手动点 */
function selectAllStages() {
  selectedStages.value = [...DEFAULT_STAGES];
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
 * 串联排队标记（前端行为：后端任务关页面照常执行，但自动接续需本页存活，刷新即失效）：
 * - queuedBillsImport：勾了「交易明细导入」时，其余段结束后自动接跑导入任务
 *   （bills 端点，共用任务表全局互斥）；
 * - queuedQuoteSteps：本次勾选的「标的行情 / 持仓行情」，在后端宏观任务结束后按固定顺序
 *   串行执行。这两步是同步 HTTP、不占任务锁，失败只提示、互不阻断、不影响宏观任务状态。
 * 🔴 不再由「期权行情」隐含触发 —— 勾哪个跑哪个（2026-11-16 拆分）。
 */
const queuedBillsImport = ref(false);
const queuedQuoteSteps = ref<QuoteStepKey[]>([]);

/** 前端行情步骤的独立进度：本地状态，不写进后端任务 result.stages，刷新页面即清空 */
interface QuoteProgress {
  key: QuoteStepKey;
  label: string;
  status: 'pending' | 'running' | 'success' | 'no_data' | 'error' | 'cancelled';
  message: string;
  durationMs: number | null;
  /** 持仓行情的四步明细 */
  details: string[];
}

const quoteProgress = ref<QuoteProgress[]>([]);

const QUOTE_STATUS_LABEL: Record<QuoteProgress['status'], string> = {
  pending: '等待',
  running: '运行中',
  success: '成功',
  no_data: '无数据',
  error: '失败',
  cancelled: '已取消'
};

const QUOTE_STATUS_TYPE: Record<QuoteProgress['status'], 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'default',
  running: 'info',
  success: 'success',
  no_data: 'warning',
  error: 'error',
  cancelled: 'default'
};

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
      if (data.scope !== 'macro_sync' && data.scope !== 'bills_import') {
        stopPolling();
        return;
      }
      task.value = data;

      // 运行中用任务参数回填勾选，避免"显示跑了 3 段、勾选只有 2 段"的错位
      if (isRunning.value) {
        const st = ((data.scope_params || {}) as Record<string, unknown>).stages;
        if (Array.isArray(st) && st.length > 0) selectedStages.value = st as StageKey[];
      } else {
        stopPolling();
        // 串联接续：行情步骤 → 交易明细导入；手动停止 status='stopped' 视为撤销排队
        const allowed = data.scope === 'macro_sync' && data.status !== 'stopped';
        if (queuedQuoteSteps.value.length > 0 || queuedBillsImport.value) {
          await runFollowups(allowed);
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
    // 后台标签页不刷进度接口（父页失活时组件可能仍存活）
    if (document.hidden) return;
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

/**
 * 单个行情步骤：写独立进度行，失败只提示、不抛、不阻断另一步。
 * runQuoteStep 本身已把失败收敛成 outcome，这里再兜一层网络异常。
 */
async function runOneQuoteStep(key: QuoteStepKey) {
  const row = quoteProgress.value.find(r => r.key === key);
  if (!row) return;
  row.status = 'running';
  row.message = '运行中…';
  row.durationMs = null;
  row.details = [];
  const startedAt = Date.now();

  let outcome: QuoteStepOutcome;
  try {
    outcome = await runQuoteStep(key);
  } catch (e) {
    outcome = { status: 'error', message: e instanceof Error ? e.message : String(e), details: [] };
  }
  row.status = outcome.status;
  row.message = outcome.message;
  row.details = outcome.details;
  row.durationMs = Date.now() - startedAt;

  if (outcome.status === 'error') message.error(`${row.label}失败：${outcome.message}`);
  else if (outcome.status === 'no_data') message.warning(`${row.label}：${outcome.message}`);
  else message.success(`${row.label}：${outcome.message}`);
}

/**
 * 前序任务结束后的自动接续（页面在线才生效；allowed=false 即手动停止，视为撤销排队）。
 * 排队标记先清空再执行 ⇒ loadTask 被重复调用时天然幂等。
 * 顺序：勾中的行情步骤（标的 → 持仓）→ 交易明细导入（导入吃到的是新价）。
 */
async function runFollowups(allowed: boolean) {
  const steps = [...queuedQuoteSteps.value];
  const followImport = queuedBillsImport.value;
  queuedQuoteSteps.value = [];
  queuedBillsImport.value = false;
  if (!allowed) {
    // 手动停止 ⇒ 撤销排队，进度行别一直挂在「等待」
    for (const row of quoteProgress.value) {
      if (row.status === 'pending' || row.status === 'running') {
        row.status = 'cancelled';
        row.message = '前序任务被停止，已取消';
      }
    }
    return;
  }

  for (const key of steps) {
    await runOneQuoteStep(key);
  }
  if (followImport) {
    message.info('前序步骤结束，自动接跑交易明细导入');
    await startImportTask();
  }
}

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
    // 后端 stages 只认 SYNC_STAGE_ORDER 的八段；bills_import 与两个行情步骤都必须过滤掉，
    // 否则 POST /bds/sync/macro 直接 400「非法 stages」
    const billsImport = selectedStages.value.includes('bills_import');
    const quoteSteps = QUOTE_STEP_KEYS.filter(k => selectedStages.value.includes(k));
    const macroStages = selectedStages.value.filter(isMacroStage);

    // 独立进度区：本次勾中的两步先置「等待」，等后端任务结束再逐步点亮
    quoteProgress.value = quoteSteps.map(
      (k): QuoteProgress => ({
        key: k,
        label: STAGE_OPTIONS.find(o => o.value === k)?.label || k,
        status: 'pending',
        message: macroStages.length > 0 ? '等待后端任务结束' : '等待执行',
        durationMs: null,
        details: []
      })
    );
    queuedBillsImport.value = billsImport;
    queuedQuoteSteps.value = [...quoteSteps];

    // 接续提示：排队了哪些步骤（都需本页在线才生效）
    const stepNames = quoteSteps.map(k => STAGE_OPTIONS.find(o => o.value === k)?.label || k).join(' → ');
    const notes = [stepNames ? `结束后执行 ${stepNames}` : '', billsImport ? '结束后自动接跑交易明细导入' : '']
      .filter(Boolean)
      .join('，');

    if (macroStages.length > 0) {
      const { data, error } = await startMacroSync({ stages: macroStages });
      if (error) {
        message.error(error.message || '启动失败');
        queuedBillsImport.value = false;
        queuedQuoteSteps.value = [];
        quoteProgress.value = [];
        return;
      }
      message.success(`已启动任务 #${data.id}${notes ? `，${notes}` : ''}`);
      await loadTask(data.id);
      startPolling();
    } else {
      // 没选后端段 ⇒ 没跑「期权行情」，提示用户这两步基于现有快照，别误以为整条链跑过
      if (quoteSteps.length > 0) {
        message.info('未勾选「期权行情」，行情步骤将基于现有快照执行');
      }
      await runFollowups(true);
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
      if (Array.isArray(st) && st.length > 0) {
        // 后端 stages 不含 bills_import 与两个前端步骤；回填时保留这几项在页面上的勾选，
        // 否则会出现「排队了行情步骤、勾选框却是空的」的错位
        const frontKeys = selectedStages.value.filter(s => NON_MACRO_STAGE_KEYS.includes(s));
        selectedStages.value = [...(st as StageKey[]), ...frontKeys];
      }
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
      <NTooltip trigger="hover" :style="{ maxWidth: '320px' }">
        <template #trigger>
          <NButton size="tiny" secondary :disabled="isRunning" @click="selectAllStages">全选</NButton>
        </template>
        全选 = 常用 8 段；交易日历、交易明细导入、黄金储备不勾，需要时手动点选
      </NTooltip>
      <NButton size="tiny" secondary :disabled="isRunning" @click="clearStages">清空</NButton>
    </div>

    <div style="margin-top: 6px; font-size: 12px; color: #999; line-height: 1.6">
      固定顺序：交易日历 → 证券信息 → 历史行情 → 期权合约字典 → 期权行情 → 经济指标 → 美债收益率 →
      黄金储备（基础数据在下游依赖之前，整体快→慢）；单项失败不中断，段失败不影响后续段。「历史行情」范围 = 证券信息表
      A股指数 ∪ 标的监测池（运行时读取、去重），个股后复权 /
      指数不复权，首次纳入的个股会全量回填、耗时较长。期权行情的范围由「期权同步清单」决定（按品种×到期月逐组拉取）。
      「标的行情」「持仓行情」是独立勾选项，在后端任务结束后按此顺序串行执行、各有单独进度：前者更新监测标的价，后者跑
      bills
      四步汇总；失败只提示、互不阻断、不影响宏观任务状态。这两步是前端同步请求，需保持本页打开，刷新页面后进度清空。宏观任务本身后台执行，关页面/刷新不影响。默认勾选与「全选」都只勾常用
      8 段，不含交易日历（仅跨年才真写库）、黄金储备（IMF 接口当前返回 502，勾上会白等约 5.5 分钟且 20
      国全失败）与交易明细导入，这三项需要时手动勾选。「交易明细导入」是 bills
      的十二步流水线（任一步失败即终止流水线）；与其他段同时勾选时先跑其余段、结束后自动接跑导入。
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

    <!-- 行情步骤单独进度：前端本地状态，不并入后端任务的分段摘要 -->
    <div v-if="quoteProgress.length > 0" style="margin-top: 16px">
      <div style="font-size: 13px; color: #666; margin-bottom: 6px">
        行情步骤进度
        <span style="font-size: 12px; color: #999">（独立进度 · 需保持本页打开 · 刷新后清空）</span>
      </div>
      <div
        v-for="row in quoteProgress"
        :key="row.key"
        style="
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 6px 0;
          border-top: 1px solid rgba(128, 128, 128, 0.15);
          font-size: 13px;
        "
      >
        <NTag :type="QUOTE_STATUS_TYPE[row.status]" size="tiny" :bordered="false" style="flex-shrink: 0">
          {{ QUOTE_STATUS_LABEL[row.status] }}
        </NTag>
        <span style="width: 80px; flex-shrink: 0">{{ row.label }}</span>
        <span style="color: #999; flex: 1">{{ row.message }}</span>
        <span v-if="row.durationMs !== null" style="color: #999; flex-shrink: 0">
          {{ (row.durationMs / 1000).toFixed(1) }}s
        </span>
      </div>
      <div v-if="quoteProgress.some(r => r.details.length > 0)" style="margin-top: 6px; font-size: 12px; color: #999">
        <div v-for="row in quoteProgress.filter(r => r.details.length > 0)" :key="`${row.key}-detail`">
          <span>{{ row.label }}子步：</span>
          <span v-for="(d, i) in row.details" :key="i">
            {{ d }}
            <span v-if="i < row.details.length - 1">·</span>
          </span>
        </div>
      </div>
    </div>
  </NCard>
</template>
