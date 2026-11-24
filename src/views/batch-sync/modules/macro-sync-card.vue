<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import {
  fetchLatestSyncTask,
  fetchSyncTask,
  fetchSyncTasks,
  startMacroSync,
  startBillsImportTask,
  stopBatchSync
} from '@/service/api';

defineOptions({ name: 'MacroSyncCard' });

const message = useMessage();

/** 串联同步链运行中（父页下发）：本卡启动按钮禁用，防撞全局互斥 409 */
const props = defineProps<{
  chainRunning?: boolean;
}>();

// ===================== 段定义 =====================

/** 十二个勾选项 = 十一个后端同步段 + 一个独立任务（交易明细导入），分「基础数据 / 行情数据 / 宏观数据」三排勾选。
 *  2026-11-16 起「标的行情 / 持仓行情」已并入后端 macro_sync 任务（注册表注入执行器），
 *  2026-11-20 补入「标的年度行情」一段，进度写 result.stages、刷新页面可恢复，
 *  与其余段共用同一张分段摘要表。
 *  后端十一段固定为 trade_date → symbol_info → history_market → option_info →
 *  option_market → underlying_hlc → underlying_quote → position_quote → wscn → daily → gold。
 */
type StageKey =
  | 'trade_date'
  | 'symbol_info'
  | 'history_market'
  | 'option_info'
  | 'option_market'
  | 'underlying_hlc'
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

/** 勾选分组（组内顺序 = 后端执行顺序）：三排展示——基础数据（下游依赖）→ 行情数据 → 宏观数据。
 *  2026-11-17 起「历史行情 / 期权行情 / 标的行情 / 持仓行情」四段从基础数据拆出单独成组，
 *  放在第二排（用户要求）；「期权合约字典」留在基础数据——它是行情段的字典依赖，执行顺序仍在期权行情之前。
 */
const STAGE_GROUPS: Array<{ name: string; options: StageOption[] }> = [
  {
    name: '基础数据',
    options: [
      { label: '交易日历', value: 'trade_date' },
      { label: '证券信息', value: 'symbol_info' },
      // 🔴 必须排在「期权行情」之前：行情同步要从字典取逐合约乘数与权威到期日，
      // 当天新挂牌的合约若还没进字典就会被跳过（后端也固定这个顺序）
      { label: '期权合约字典', value: 'option_info' },
      // 交易明细导入（bills 12 步流水线）：与其他段不同，它跑的是 bills 自己的
      // 后台任务端点，且因全局互斥只能串联排队——见 handleStart 的分流逻辑
      { label: '交易明细导入', value: 'bills_import' }
    ]
  },
  {
    name: '行情数据',
    options: [
      { label: '历史行情(指数+标的)', value: 'history_market' },
      { label: '期权行情', value: 'option_market' },
      // 三段行情链紧跟「期权行情」：吃期权快照更新后的价，且后端固定这个顺序。
      // 🔴 年度行情必须排在标的行情之前：先写 py_close/y_high/y_low 基准，再改 price，
      //    钩子才能用新基准算 pv_*（2026-11-20 补入，此前只在手动端点、y_low 长期冻结）
      { label: '标的年度行情', value: 'underlying_hlc' },
      { label: '标的行情', value: 'underlying_quote' },
      { label: '持仓行情', value: 'position_quote' }
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
  underlying_hlc: '/irs/underlying-monitors',
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
 * 「标的行情」「持仓行情」2026-11-16 起是后端任务段（不再是前端同步请求），
 * 默认仍勾上以保持日常一键同步的行为等价，进度进分段摘要、失败不阻断后续段。
 * 「持仓行情」内部四步是整段原子：任一步失败即终止该段，避免带病汇总。
 */
const MANUAL_ONLY_STAGES: StageKey[] = ['trade_date', 'bills_import', 'gold'];

/**
 * 后端 stages 白名单 = server_fast/app/bds/router.py::SYNC_STAGE_ORDER 的十一段。
 * TS 侧用类型守卫收窄，避免把 bills_import（独立任务）断言塞给 MacroSyncRequest。
 */
const MACRO_STAGE_KEYS = [
  'trade_date',
  'symbol_info',
  'history_market',
  'option_info',
  'option_market',
  'underlying_hlc',
  'underlying_quote',
  'position_quote',
  'wscn',
  'daily',
  'gold'
] as const;

type MacroStageKey = (typeof MACRO_STAGE_KEYS)[number];

function isMacroStage(s: StageKey): s is MacroStageKey {
  return (MACRO_STAGE_KEYS as readonly string[]).includes(s);
}

/** 不进后端 stages 的勾选项：由白名单取反派生（当前只剩 bills_import），杜绝两份清单漂移 */
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
 * 串联排队标记（前端行为：后端任务关页面照常执行，但自动接续需本页存活，刷新即失效）。
 * 勾了「交易明细导入」时，其余十段跑完后自动接跑 bills 的独立任务（共用全局互斥）。
 * 标的 / 持仓行情 2026-11-16 起已并入同一个 macro_sync 任务，不再需要前端排队。
 */
const queuedBillsImport = ref(false);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');

/** 表单锁定：本卡任务运行中 或 串联链运行中 ⇒ 勾选/按钮不可编辑（防误改，链参数已固化） */
const formLocked = computed(() => isRunning.value || !!props.chainRunning);
const progressValue = computed(() => Number(task.value?.progress || 0));
const errorList = computed(() => task.value?.errors || []);

/** 段摘要（来自后端 result.stages，逐项累计；十段共用这张表） */
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
  /** 跨模块段不报写入行数：'step'=完成步数，'symbol'=更新标的数 */
  unit?: 'step' | 'symbol';
  /** 行情链执行器回传的子步明细（持仓行情四步 / 标的行情更新数） */
  steps?: string[];
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
  {
    title: '条数合计',
    key: 'rows',
    width: 100,
    render: (row: StageStat) => {
      if (row.unit === 'step') return `${row.rows} 步`;
      if (row.unit === 'symbol') return `${row.rows} 个标的`;
      return row.rows;
    }
  },
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

      // 运行中用任务参数回填勾选，避免"显示跑了 3 段、勾选只有 2 段"的错位。
      // ⚠️ 后端 stages 只含宏观段（bills_import 是独立任务不进参数）——回填时必须
      // 保留前端段勾选，否则轮询第一 tick 后「交易明细导入」显示未勾选（实际仍在
      // queuedBillsImport 排队、结束后照常接跑，纯展示错位，2026-11-24 修复）。
      if (isRunning.value) {
        const st = ((data.scope_params || {}) as Record<string, unknown>).stages;
        if (Array.isArray(st) && st.length > 0) {
          const frontKeys = selectedStages.value.filter(s => NON_MACRO_STAGE_KEYS.includes(s));
          selectedStages.value = [...(st as StageKey[]), ...frontKeys];
        }
      } else {
        stopPolling();
        // 串联接续：只剩「交易明细导入」；手动停止 status='stopped' 视为撤销排队
        const allowed = data.scope === 'macro_sync' && data.status !== 'stopped';
        if (queuedBillsImport.value) {
          await runBillsImportFollowup(allowed);
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
 * 前序任务结束后的自动接续（页面在线才生效；allowed=false 即手动停止，视为撤销排队）。
 * 排队标记先清空再执行 ⇒ loadTask 被重复调用时天然幂等。
 * 行情链已在同一个 macro_sync 任务里跑完，这里只接跑 bills 的独立导入任务。
 */
async function runBillsImportFollowup(allowed: boolean) {
  const follow = queuedBillsImport.value;
  queuedBillsImport.value = false;
  if (!allowed || !follow) return;
  message.info('前序步骤结束，自动接跑交易明细导入');
  await startImportTask();
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
    // 后端 stages 只认 SYNC_STAGE_ORDER 的十段；bills_import 是独立任务必须过滤掉，
    // 否则 POST /bds/sync/macro 直接 400「非法 stages」
    const billsImport = selectedStages.value.includes('bills_import');
    const macroStages = selectedStages.value.filter(isMacroStage);

    if (macroStages.length > 0) {
      // 「交易明细导入」需等本任务结束后再起（bills 端点，共用全局互斥）
      queuedBillsImport.value = billsImport;
      const notes = billsImport ? '，结束后自动接跑交易明细导入' : '';
      const { data, error } = await startMacroSync({ stages: macroStages });
      if (error) {
        message.error(error.message || '启动失败');
        queuedBillsImport.value = false;
        return;
      }
      message.success(`已启动任务 #${data.id}${notes}`);
      await loadTask(data.id);
      startPolling();
    } else {
      // 只勾了「交易明细导入」：直接起 bills 的独立任务
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

/** 串联同步链入口（父页经模板 ref 调用）：拆分 macro_sync + bills_import 两个链单元 */
function getChainEntry():
  | { entries: Array<{ card: string; params: Record<string, unknown>; risks: string[] }> }
  | { error: string } {
  if (selectedStages.value.length === 0) {
    return { error: '「宏观与基础数据」请至少选择一个同步段' };
  }
  const macroStages = selectedStages.value.filter(isMacroStage);
  const entries: Array<{ card: string; params: Record<string, unknown>; risks: string[] }> = [];
  if (macroStages.length > 0) {
    // 单卡启动的「结束后自动接跑导入」前端接续在串联下由链统一编排，不再排队
    entries.push({ card: 'macro_sync', params: { stages: macroStages }, risks: [] });
  }
  if (selectedStages.value.includes('bills_import')) {
    entries.push({ card: 'bills_import', params: {}, risks: [] });
  }
  if (entries.length === 0) {
    return { error: '「宏观与基础数据」没有可执行的同步段' };
  }
  return { entries };
}

/** 串联同步链依赖的状态与方法：isRunning 供父页判定全局互斥，getChainEntry 供链卡组参 */
defineExpose({ isRunning, getChainEntry });

// ===================== 初始化 =====================

onMounted(async () => {
  // 认领：从最近 20 条任务里找本卡 scope 的最新一条（列表按创建时间倒序）。
  // 不能用 fetchLatestSyncTask：串联链运行中/结束后最新一条是 scope='chained_sync'
  // 的链任务行，latest 会让本卡认领不到自己的子任务（2026-11-24 修复，对齐两张 pct 卡）。
  // 宏观任务（macro_sync）与导入任务（bills_import）都归本卡片接管
  const { data, error } = await fetchSyncTasks(20);
  const mine =
    !error && Array.isArray(data)
      ? data.find(item => item.scope === 'macro_sync' || item.scope === 'bills_import')
      : null;
  if (mine) {
    task.value = mine;
    if (isRunning.value) {
      const st = ((mine.scope_params || {}) as Record<string, unknown>).stages;
      if (Array.isArray(st) && st.length > 0) {
        // 后端 stages 不含 bills_import；回填时保留它在页面上的勾选，
        // 否则会出现「排队了导入任务、勾选框却是空的」的错位
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
      <NButton size="small" :loading="starting" :disabled="formLocked" @click="handleStart">启动</NButton>
      <NButton v-if="isRunning" size="small" :loading="stopping" @click="handleStop">停止</NButton>
    </template>

    <!-- 段选择：分「基础数据 / 行情数据 / 宏观数据」三排，组内与跨组顺序即后端执行顺序 -->
    <div style="display: flex; gap: 16px; align-items: flex-start">
      <span style="font-size: 13px; color: #666; flex-shrink: 0; line-height: 24px">同步段：</span>
      <NCheckboxGroup v-model:value="selectedStages" :disabled="formLocked" style="flex: 1">
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
          <NButton size="tiny" secondary :disabled="formLocked" @click="selectAllStages">全选</NButton>
        </template>
        全选 = 常用 8 段；交易日历、交易明细导入、黄金储备不勾，需要时手动点选
      </NTooltip>
      <NButton size="tiny" secondary :disabled="formLocked" @click="clearStages">清空</NButton>
    </div>

    <div style="margin-top: 6px; font-size: 12px; color: #999; line-height: 1.6">
      固定顺序：交易日历 → 证券信息 → 历史行情 → 期权合约字典 → 期权行情 → 标的行情 → 持仓行情 → 经济指标 → 美债收益率 →
      黄金储备（基础数据在下游依赖之前，整体快→慢）；单项失败不中断，段失败不影响后续段。「历史行情」范围 = 证券信息表
      A股指数 ∪ 标的监测池（运行时读取、去重），个股后复权 /
      指数不复权，首次纳入的个股会全量回填、耗时较长。期权行情的范围由「期权同步清单」决定（按品种×到期月逐组拉取）。
      「标的行情」「持仓行情」已并入同一个后台任务：前者更新监测标的价，后者跑 bills
      四步汇总（整段原子，任一步失败即终止该段）；两步紧跟「期权行情」吃新快照，进度与其余段一起写进「分段摘要」，刷新页面不丢，这两段的「条数合计」按标的数
      / 步数显示。任务后台执行，关页面/刷新不影响，停止按钮项间生效。默认勾选与「全选」都只勾常用 8
      段，不含交易日历（仅跨年才真写库）、黄金储备（IMF 接口当前返回 502，勾上会白等约 5.5 分钟且 20
      国全失败）与交易明细导入，这三项需要时手动勾选。「交易明细导入」是 bills
      的十二步流水线（任一步失败即终止流水线）；与其他段同时勾选时先跑其余段、结束后自动接跑导入（自动接续需保持本页打开）。
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

      <!-- 分段摘要：十段共用一张表；两段行情链的子步明细由后端 result.stages[].steps 提供 -->
      <div v-if="stageStats.length > 0" style="margin-top: 12px">
        <div style="font-size: 13px; color: #666; margin-bottom: 6px">分段摘要</div>
        <NDataTable :columns="stageColumns" :data="stageStats" :bordered="false" size="small" />
        <div
          v-for="s in stageStats.filter(x => x.steps?.length)"
          :key="`${s.key}-steps`"
          style="margin-top: 6px; font-size: 12px; color: #999; line-height: 1.6"
        >
          <span>{{ s.name }}子步：</span>
          <span v-for="(d, i) in s.steps || []" :key="i">
            {{ d }}
            <span v-if="i < (s.steps?.length ?? 0) - 1">·</span>
          </span>
        </div>
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
