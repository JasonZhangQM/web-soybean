<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, h } from 'vue';
import { NSelect, useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import {
  deleteOptionConfig,
  fetchGroupSymbolOptions,
  fetchOptionConfigs,
  fetchOptionMarket,
  fetchOptionMarketFilters,
  fetchOptionMarketLatestDate,
  fetchOptionSyncPlan,
  fetchSyncTask,
  syncOptionMarket,
  updateOptionConfig
} from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'OptionMarketPage' });

/**
 * 期权行情（`bds_option_market`）
 *
 * 数据由**配置驱动**同步：`bds_option_config` 决定"要同步哪些合约"，
 * 点搜索区的「行情同步」一次拉完（后台任务 + 进度 + 审计落库）。
 *
 * 三个必须先知道的展示口径（否则会把 null 当成数据缺失）：
 * 1. `settle`（结算价）**只有商品期权拿得到**——股指与 ETF 期权的 akshare 接口本来就没有
 *    这个字段，所以显示 `-` 并带 tooltip，**不拿前结价冒充**（会误导风险计算）。
 * 2. `delta_opt` 同理，只有商品期权有（认沽为负）。
 * 3. `volume` / `open_interest` 对 ETF 恒为 null：接口的「数量」列实测恒等于返回行数
 *    （26 行全是 26），不是成交量，宁缺勿造。
 * 4. **日期是「起始日」不是「精确日」**（2026-10-27 改）：不填=全部历史（按 trade_date
 *    倒序），填了=从该日起筛到最新。表按日累积成时间序列，精确单日筛法会让「最近几天」
 *    这种最常见的核账动作变成反复改日期。
 *
 * ⚠️ 清单（行情表与同步清单）的唯一身份都是 `contract_id`（openctp 合约ID），
 * 交易所标准码**不在本页展示**（行情表既不存也不返回，要看去「合约字典」）。
 * contract_id 三品种三种写法：IO 是 `IO2611-P-4000`、au 是 `au2612P840`（去账单前缀即可）、
 * ETF 是 8 位数字 `10012562`，而券商码是 `SHQQ.10012562` —— 两者前缀不同，
 * 所以单独显示「券商码」列，对账时才不会对不上。
 *
 * 🔴 2026-10-27 起，清单里的**合约规格是只读派生值**（来自 `bds_option_info`），
 * 本页不再提供任何规格编辑或「补全规格」入口 —— 规格的权威在交易所字典，
 * 要更新只有一条路：去「合约字典」页点刷新。
 */

const message = useMessage();
const router = useRouter();
// 项目惯例：dialog 走 window.$dialog（AppProvider 在 provider 内部注册），
// 页面里直接 useDialog() 拿不到 provider 上下文
const dialog = window.$dialog;

const loading = ref(false);
const tableData = ref<Api.Bds.OptionMarket[]>([]);
const pagination = createTablePagination();

// 筛选条件（searchParams 必须在 pagination 之前声明，反序会报 TS2448）
const searchParams = reactive<{
  option_name?: string | null;
  end_month?: string | null;
  option_type?: string | null;
  contract_id?: string | null;
  trade_date?: string | null;
}>({});
usePageState({ searchParams, pagination });

const filters = ref<Api.Bds.OptionMarketFilters>({ option_names: [], end_months: [], und_keys: [] });
const latest = ref<Api.Bds.OptionMarketLatestDate>({
  latest_trade_date: null,
  by_und: {},
  sync_time: null
});

const optionNameOptions = computed(() => filters.value.option_names.map(n => ({ label: n, value: n })));
const endMonthOptions = computed(() =>
  filters.value.end_months.map(m => ({ label: `${m.slice(0, 4)}-${m.slice(4)}`, value: m }))
);
const typeOptions = [
  { label: '认沽', value: 'put' },
  { label: '认购', value: 'call' }
];

/** 价格：小面值（ETF 0.08 级）保留 4 位，大面值（IO/黄金）2 位 */
function fmtPx(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) < 10 ? n.toFixed(4) : n.toFixed(2);
}

/** 行权价：整数不显示小数（4000 / 6.25） */
function fmtStrike(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '-';
}

/** 该品种接口是否提供该字段（决定 `-` 是"接口不提供"还是"数据缺失"） */
const NO_SETTLE_UND = ['csi300', 'csi500etf'];

/** 缺失值渲染：带 tooltip 说明「接口不提供」，避免被当成同步失败 */
function dash(title: string) {
  return h('span', { style: 'color: #bbb', title }, '-');
}

function fmtMissing(v: unknown, title: string, digits = 4) {
  if (v === null || v === undefined || v === '') return dash(title);
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : dash(title);
}

const columns = [
  { title: '行情日期', key: 'trade_date', width: 110 },
  {
    title: '合约ID',
    key: 'contract_id',
    width: 160,
    // 唯一身份：三品种写法统一（IO2611-P-4000 / au2612P840 / 10012562）。
    // 交易所标准码不在本页展示 —— 行情表既不存也不返回它，要看去「合约字典」。
    render: (r: Api.Bds.OptionMarket) => h('span', { style: 'font-family: monospace' }, r.contract_id)
  },
  {
    title: '行权价',
    key: 'price_strike',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtStrike(r.price_strike)
  },
  { title: '到期日', key: 'delisted_date', width: 110, render: (r: Api.Bds.OptionMarket) => r.delisted_date || '-' },
  {
    title: '剩余天',
    key: 'days_left',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => (r.days_left == null ? '-' : String(r.days_left))
  },
  {
    title: '现价',
    key: 'price',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.price)
  },
  {
    title: '结算价',
    key: 'settle',
    width: 95,
    align: 'right' as const,
    // 股指/ETF 的接口根本没有结算价字段 ⇒ 明确留空，不拿前结价顶替（会误导保证金计算）
    render: (r: Api.Bds.OptionMarket) =>
      NO_SETTLE_UND.includes(r.und_key) ? dash('该品种接口不提供结算价（仅商品期权有）') : fmtPx(r.settle)
  },
  {
    title: '标的价',
    key: 'price_ud',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.price_ud)
  },
  {
    title: '内在价值',
    key: 'value_i',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.value_i)
  },
  {
    title: '时间价值',
    key: 'value_t',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.value_t)
  },
  // ---- 以下 5 列为衍生字段（2026-10-27 新增，钩子落库时计算）----
  // 都由 price_ud 派生：标的价缺失（如盘前同步的历史行）时整组为空，属正常现象。
  // 年化 = 对应 % × 365 ÷ 剩余自然天，仅剩 0 天时置 0（防除零）。
  {
    title: '平值(%)',
    key: 'atm_i',
    width: 88,
    align: 'right' as const,
    // 行权价相对标的价的偏移：正 = 行权价在标的上方（对 put 是虚值方向）
    render: (r: Api.Bds.OptionMarket) => fmtMissing(r.atm_i, '平值(%)（标的价缺失时为空）', 2)
  },
  {
    title: '时间(%)',
    key: 'ratio_t',
    width: 88,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtMissing(r.ratio_t, '时间价值占行权价 %（标的价缺失时为空）', 2)
  },
  {
    title: '内在(%)',
    key: 'ratio_i',
    width: 88,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtMissing(r.ratio_i, '内在价值占行权价 %（标的价缺失时为空）', 2)
  },
  {
    title: '时间(%Y)',
    key: 'ratio_t_y',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtMissing(r.ratio_t_y, '时间(%) 年化 = ×365÷剩余自然天', 2)
  },
  {
    title: '内在(%Y)',
    key: 'ratio_i_y',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtMissing(r.ratio_i_y, '内在(%) 年化 = ×365÷剩余自然天', 2)
  },
  {
    title: 'delta',
    key: 'delta_opt',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      NO_SETTLE_UND.includes(r.und_key)
        ? dash('该品种接口不提供 delta（仅商品期权有）')
        : fmtMissing(r.delta_opt, 'delta', 4)
  },
  {
    title: '成交量',
    key: 'volume',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      r.volume == null
        ? dash('该品种接口的成交量字段不可信（ETF 的「数量」列恒等于返回行数），故留空')
        : String(r.volume)
  },
  {
    title: '持仓量',
    key: 'open_interest',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      r.open_interest == null ? dash('该品种接口不提供持仓量') : String(r.open_interest)
  }
];

/** scroll-x 必须 ≥ 列宽和，否则 naive-ui 会压缩列导致折行（§4.11） */
const scrollX = computed(() => columns.reduce((sum, c) => sum + (c.width || 0), 0));

/** 行键：主键即唯一（表有 uk(contract_id, trade_date)，id 稳定） */
function marketRowKey(r: Api.Bds.OptionMarket) {
  return r.id;
}

/** 配置行键 */
function configRowKey(r: Api.Bds.OptionConfig) {
  return r.id;
}

// ===================== 查询 =====================

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionMarket({
      option_name: searchParams.option_name || undefined,
      end_month: searchParams.end_month || undefined,
      option_type: searchParams.option_type || undefined,
      contract_id: searchParams.contract_id || undefined,
      trade_date: searchParams.trade_date || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (error) {
      message.error((error as any)?.message || '期权行情获取失败');
      return;
    }
    tableData.value = data?.items || [];
    setPaginationTotal(pagination, data?.total || 0, data?.total_is_estimated);
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  const [f, l] = await Promise.all([fetchOptionMarketFilters(), fetchOptionMarketLatestDate()]);
  if (!f.error && f.data) filters.value = f.data;
  if (!l.error && l.data) latest.value = l.data;
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.option_name = null;
  searchParams.end_month = null;
  searchParams.option_type = null;
  searchParams.contract_id = null;
  searchParams.trade_date = null;
  pagination.page = 1;
  fetchData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// ===================== 行情同步（任务化 + 按组进度） =====================

const syncLoading = ref(false);
const syncTask = ref<Api.Bds.SyncTask | null>(null);
const syncRunning = computed(() => ['pending', 'running'].includes(syncTask.value?.status || ''));
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(taskId: number) {
  stopPolling();
  pollTimer = setInterval(async () => {
    const { data, error } = await fetchSyncTask(taskId);
    if (error || !data) return;
    syncTask.value = data;
    if (!['pending', 'running'].includes(data.status)) {
      stopPolling();
      syncLoading.value = false;
      onSyncFinished(data);
    }
  }, 2000);
}

/** 收尾提示：把「新增/更新/跳过/失败」讲清楚，跳过要看得出是价格 0 还是格式不符 */
function onSyncFinished(task: Api.Bds.SyncTask) {
  const r = (task.result || {}) as any;
  if (task.status === 'failed') {
    message.error(`同步失败：${task.errors?.[0]?.message || '未知错误'}`);
    return;
  }
  if (task.status === 'stopped') {
    message.warning('同步已停止（已完成的部分已入库）');
    loadMeta();
    fetchData();
    return;
  }
  // 口径：本任务的 success_count = 写入行数，与批量同步页「段内项数」不是一回事，
  // 所以每个数字后面都带「行」，避免被读成项数
  const parts = [
    `成功 ${r.group_ok ?? 0}/${r.group_total ?? 0} 组`,
    `新增 ${r.row_insert ?? 0} 行`,
    `更新 ${r.row_update ?? 0} 行`,
    `跳过 ${r.row_skip ?? 0} 行`
  ];
  const skipDetail = Object.entries(r.per_group || {})
    .flatMap(([, g]: any) => (g.skip_reasons ? Object.entries(g.skip_reasons) : []))
    .map(([k, v]) => `${k}×${v}`)
    .join('、');
  const text = parts.join('，') + (skipDetail ? `（跳过原因：${skipDetail}）` : '');
  if (task.status === 'done' && (r.group_failed ?? 0) > 0) {
    message.warning(`${text}；${r.group_failed} 组失败，详见任务审计`);
  } else {
    message.success(text);
  }
  loadMeta();
  fetchData();
}

/** 点「行情同步」：先拿计划数 → 确认框讲清代价 → 起任务 → 轮询进度 */
async function handleSync() {
  if (syncRunning.value) return;
  syncLoading.value = true;
  try {
    const { data: plan, error } = await fetchOptionSyncPlan();
    if (error || !plan) {
      message.error((error as any)?.message || '取同步计划失败');
      return;
    }
    if (plan.symbol_count === 0) {
      message.warning('同步清单为空，请先点右侧「同步清单」添加合约');
      return;
    }
    const groupText = plan.groups
      .map(g => `${g.option_name}/${g.end_month === 'ALL' ? '全部月份' : g.end_month}`)
      .join('、');
    dialog?.info({
      title: '确认同步期权行情',
      content: () =>
        h('div', { style: 'line-height:1.9' }, [
          h(
            'div',
            `将同步 ${plan.symbol_count} 个合约，覆盖 ${plan.group_count} 个「品种×到期月」组合（= ${plan.group_count} 次接口请求）。`
          ),
          h('div', { style: 'color:#888;font-size:12px;margin-top:4px' }, groupText),
          h(
            'div',
            { style: 'color:#888;font-size:12px;margin-top:8px' },
            '按日快照入库：同一天重跑会覆盖，跨日累积成时间序列。'
          )
        ]),
      positiveText: '开始同步',
      negativeText: '取消',
      onPositiveClick: () => {
        doSync();
      }
    });
  } finally {
    // 取消时也要复位 loading（onPositiveClick 里会再置 true）
    if (!syncRunning.value) syncLoading.value = false;
  }
}

async function doSync() {
  syncLoading.value = true;
  syncTask.value = null;
  const { data, error } = await syncOptionMarket();
  if (error || !data) {
    syncLoading.value = false;
    message.error((error as any)?.message || '启动同步失败（可能有其他任务在跑）');
    return;
  }
  syncTask.value = data;
  startPolling(data.id);
}

/** 进度文案：必须显示「第几组/共几组」——耗时在接口请求上，只给百分比会长时间停 0% */
const syncProgressText = computed(() => {
  const t = syncTask.value;
  if (!t) return '';
  if (t.status === 'stopped') return '已停止';
  const total = t.total_count || 0;
  const done = t.done_count || 0;
  if (['done', 'failed'].includes(t.status)) return `完成 ${done}/${total} 组`;
  return `${done}/${total} 组进行中…`;
});

// ===================== 同步清单抽屉 =====================

const configDrawer = ref(false);
const configLoading = ref(false);
const configRows = ref<Api.Bds.OptionConfig[]>([]);

/**
 * 清单表分页：**本地分页**（`bds_option_config` 一次全量拉回，量级只有几十行，
 * 不值得为它做服务端 offset/limit）。
 *
 * 不用 `createTablePagination()`：那个是给远程列表页配的，`itemCount` 强制初始化为 0
 * 且由 `setPaginationTotal` 回填；本地分页必须**不传 itemCount**，naive-ui 才会按
 * `data.length` 自己算总数。
 *
 * pageSize 与项目其他列表页一致（20），所以表格高度也一致 —— 超过 20 行自动翻页，
 * 不会随配置条数无限变长。
 */
const configPagination = reactive({
  page: 1,
  pageSize: 20,
  pageSizes: [10, 20, 50],
  showSizePicker: true,
  // prefix 的入参里 itemCount 是 `number | undefined`（本地分页由 naive-ui 按
  // data.length 现算，类型上仍放宽为可选），所以这里要兜 0，别直接拼。
  prefix: (info: { itemCount?: number }) => `共 ${info.itemCount ?? 0} 条`,
  onUpdatePage: (p: number) => {
    configPagination.page = p;
  },
  onUpdatePageSize: (s: number) => {
    configPagination.pageSize = s;
    configPagination.page = 1;
  }
});

async function loadConfigs() {
  configLoading.value = true;
  try {
    const { data, error } = await fetchOptionConfigs();
    if (!error && data) configRows.value = data;
  } finally {
    configLoading.value = false;
  }
}

// ---------------- 券商码内联编辑（跨模块只读调 bills） ----------------
//
// `broker_symbol` 是「认领实盘持仓」的唯一钥匙：`risk_scenario.load_context()` 用
// `{broker_symbol: cfg}` 去匹配账单 `bills_group.symbol`，匹配不上**直接 raise**，
// 整个 `/bills/risk-scenario` 返回 500 —— 不是少算一条。所以这个字段要么填对，
// 要么明确留空，不能靠手打。
//
// 候选来自 bills：`GET /bills/group-symbols/symbol-options`（服务端已去重、剔除
// 资金流水占位码、持仓中优先）。**接口放 bills 是刻意的**——「有哪些合法账单码」
// 属于账单事实，bds 后端一行 import 都不加（规则 4.12 依赖只能向下），
// 写入仍走 `PUT /bds/option-config/{id}`。

/** 券商码候选（一次拉全，81 个，不分页） */
const brokerCodes = ref<Api.Bills.GroupSymbolCode[]>([]);
/** 正在写库的行 id（行级 loading，防止同一行连点并发） */
const brokerSaving = ref<number | null>(null);
/**
 * 受控组件的重绘触发器。
 *
 * NSelect 的 value 绑的是 `row.broker_symbol`。用户在确认框里点了「取消」时 row 没变，
 * Vue 认为 props 没变化不会重渲染，NSelect 会停在新选的值上（显示与数据不一致）。
 * 取消时把这个数 +1，拼进 NSelect 的 key，强制重建，值就回弹到真实值。
 */
const brokerResetKey = ref(0);

async function loadBrokerCodes() {
  if (brokerCodes.value.length) return; // 候选几乎不变，一次会话拉一次就够
  const { data, error } = await fetchGroupSymbolOptions();
  if (!error && data) brokerCodes.value = data;
}

/**
 * 每行一份下拉选项。**必须是 per-row**，不能用全局一份：
 *
 * 1. **被别的行占用的码要 disabled** —— `bds_option_config.broker_symbol` 没有唯一约束，
 *    两行填同一个码会让 `risk_scenario` 的字典静默「后写覆盖先写」，不报错但算错人。
 *    内联编辑会把这种误操作从「偶尔」变成「随手」，所以必须在选项层面堵住。
 * 2. **当前值不在候选里时要补一条** —— 比如该合约的账单成交已不在库里，或码是历史手填的。
 *    不补的话 NSelect 显示空白，用户以为没填，随手选一个就把原本正确的值改掉了。
 * 3. 持仓中的码加「持仓中」后缀：81 个候选里真正在用的只有几张，不标就得一个个找。
 */
const brokerOptionsByRow = computed(() => {
  const usedBy = new Map<string, number>(); // symbol -> 占用它的 config 行 id
  for (const r of configRows.value) {
    if (r.broker_symbol) usedBy.set(r.broker_symbol, r.id);
  }
  const known = new Set(brokerCodes.value.map(c => c.symbol));
  const map = new Map<number, Array<{ label: string; value: string; disabled?: boolean }>>();
  for (const r of configRows.value) {
    const opts = brokerCodes.value.map(c => ({
      label: Number(c.value_total ?? 0) !== 0 ? `${c.symbol}（持仓中）` : c.symbol,
      value: c.symbol,
      // 自己占用自己不算冲突：`?? r.id` 让「没被任何人占用」与「被自己占用」同样放行
      disabled: (usedBy.get(c.symbol) ?? r.id) !== r.id
    }));
    if (r.broker_symbol && !known.has(r.broker_symbol)) {
      opts.unshift({ label: `${r.broker_symbol}（账单里查不到）`, value: r.broker_symbol, disabled: false });
    }
    map.set(r.id, opts);
  }
  return map;
});

/**
 * 写券商码（只发这一个字段，后端对 None 视为「不改」，空串才是清空）。
 *
 * 成功后才写回 row：这样接口失败时 UI 自动回弹到旧值，不会出现「界面显示改了、库里没改」。
 */
async function saveBrokerSymbol(row: Api.Bds.OptionConfig, next: string) {
  brokerSaving.value = row.id;
  try {
    const { error } = await updateOptionConfig(row.id, { broker_symbol: next });
    if (error) {
      message.error('券商码更新失败');
      brokerResetKey.value += 1; // 失败也要回弹，否则界面停在没生效的新值上
      return;
    }
    row.broker_symbol = next || null;
    message.success(next ? `券商码已改为 ${next}` : `已清空 ${row.contract_id} 的券商码`);
  } finally {
    brokerSaving.value = null;
  }
}

async function handleBrokerChange(row: Api.Bds.OptionConfig, val: string | null) {
  const next = (val ?? '').trim();
  if ((row.broker_symbol ?? '') === next) return;

  if (!next) {
    // 清空不是「少个备注」：该合约会退出风险情景推演（匹配不上直接 raise 500）
    dialog?.warning({
      title: '清空券商码',
      content:
        `清空 ${row.contract_id} 的券商码后，该合约将**退出风险情景推演**` +
        '（系统靠券商码认领账单持仓，匹配不上会直接报错，不是少算一条）。确定清空？',
      positiveText: '确定清空',
      negativeText: '取消',
      onPositiveClick: () => saveBrokerSymbol(row, ''),
      onNegativeClick: () => {
        brokerResetKey.value += 1; // 取消：强制回弹到库里的值
      }
    });
    return;
  }
  await saveBrokerSymbol(row, next);
}

/** 券商码列：下拉即改，选了就落库；空值显示占位而不是 '-' */
function renderBrokerSymbol(row: Api.Bds.OptionConfig) {
  return h(NSelect, {
    key: `broker-${row.id}-${brokerResetKey.value}`,
    value: row.broker_symbol ?? null,
    options: brokerOptionsByRow.value.get(row.id) ?? [],
    clearable: true,
    filterable: true,
    size: 'small',
    placeholder: '未填（点此选账单码）',
    loading: brokerSaving.value === row.id,
    'onUpdate:value': (v: string | null) => handleBrokerChange(row, v)
  });
}

function openConfigDrawer() {
  configDrawer.value = true;
  configPagination.page = 1;
  loadConfigs();
  loadBrokerCodes();
}

/** 规格唯一来源是合约字典：跳过去刷新（本页不再提供补全入口） */
function goOptionInfo() {
  configDrawer.value = false;
  router.push({ name: 'bds_option-info' });
}

async function toggleConfig(row: Api.Bds.OptionConfig, enabled: boolean) {
  const { error } = await updateOptionConfig(row.id, { is_enabled: enabled ? 1 : 0 });
  if (error) {
    message.error('更新失败');
    return;
  }
  row.is_enabled = enabled ? 1 : 0;
  // 提示统一用 contract_id：清单与行情表都以它为唯一身份，标准码不在本页展示
  const label = row.contract_id;
  message.success(enabled ? `已启用 ${label}` : `已停用 ${label}`);
}

function removeConfig(row: Api.Bds.OptionConfig) {
  dialog?.warning({
    title: '删除同步配置',
    content: `删除 ${row.contract_id} 的同步配置？已同步的行情不会被删（行情是事实数据，删配置只影响后续同步范围）。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteOptionConfig(row.id);
      if (error) {
        message.error('删除失败');
        return;
      }
      message.success('已删除');
      loadConfigs();
    }
  });
}

const configColumns = [
  {
    // 唯一身份：ETF 的标准码跨标的会撞（`C2612M01350` 同属 588000/588080），
    // 只有合约ID 能唯一指定一行。
    // 🔴 2026-10-27：`bds_option_config` 已无 `symbol` 物理列，标准码是 join 字典的
    //    派生值 ⇒ 「代码」列整列删除。要看标准码去「合约字典」页，本薄清单只留
    //    「要同步什么、怎么拉」。
    title: '合约ID',
    key: 'contract_id',
    width: 130,
    render: (r: Api.Bds.OptionConfig) => h('span', { style: 'font-family:monospace' }, r.contract_id)
  },
  {
    // 券商码：**本页唯一的可编辑派生业务键**（另一个可编辑列是启用开关）。
    // 240 宽（10-27 由 190 加宽）：19 字符的 CFFEX.IO2611-P-4000 之外，
    // 还要放下拉箭头 + 「（账单里查不到）」这条兜底选项的后缀 —— NSelect 的
    // 下拉面板默认跟随触发器宽度，190 时后缀会被截断，正是最需要看清的那一行。
    // 候选来自 bills 的账单标的表 —— 选不到不存在的码，10-26 那次「手拼码多 6 位」
    // 那类错在结构上不可能再发生。
    title: '券商码',
    key: 'broker_symbol',
    width: 240,
    render: (r: Api.Bds.OptionConfig) => renderBrokerSymbol(r)
  },
  { title: '品种', key: 'option_name', width: 150 },
  {
    title: '到期月',
    key: 'end_month',
    width: 90,
    render: (r: Api.Bds.OptionConfig) => (r.end_month === 'ALL' ? '全部月份' : r.end_month || '-')
  },
  {
    // 到期日：join 字典的 last_trade_date（权威值），纯只读派生（2026-10-27 五次变更加回）。
    // 到期月 YYYYMM 看不出「具体哪天到期、还剩几天」，续月决策需要日粒度。
    title: '到期日',
    key: 'expiry_date',
    width: 110,
    render: (r: Api.Bds.OptionConfig) => r.expiry_date || dash('字典里查不到该合约，先刷新合约字典')
  },
  {
    title: '启用',
    key: 'is_enabled',
    width: 80,
    render: (r: Api.Bds.OptionConfig) =>
      h('span', { style: `color:${r.is_enabled ? '#2f9e6e' : '#bbb'}` }, r.is_enabled ? '是' : '否')
  },
  // 🔴 2026-10-27 三次变更：「规格（来自合约字典）」列整列删除。
  //    原因：①方向/行权价/乘数/到期日只是把字典里的值抄到这一页，要看得去「合约字典」页；
  //    ②该列末尾的保证金族（margin_type）压根不来自字典，是品种级派生（`margin_type_of`），
  //    标题「来自合约字典」名不副实。后端响应里的 cp/strike/multiplier/margin_type/
  //    expiry_date 五个字段也随之删除，本清单只回答「同步什么、怎么拉」。
  // 🔴 2026-10-27 四次变更：「备注」列删除（同时后端删掉 source / note 两列）。
  //    note 恒为「从持仓导入（券商码）」的复述、source 恒 holding，都是 import-holding
  //    下线后的残留；券商码本身已可内联编辑，这两个字段没有任何信息增量。
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render: (r: Api.Bds.OptionConfig) =>
      h('div', { style: 'display:flex;gap:8px' }, [
        h(
          'span',
          {
            style: 'color:#2080f0;cursor:pointer;user-select:none',
            onClick: () => toggleConfig(r, !r.is_enabled)
          },
          r.is_enabled ? '停用' : '启用'
        ),
        h(
          'span',
          {
            style: 'color:#d03050;cursor:pointer;user-select:none',
            onClick: () => removeConfig(r)
          },
          '删除'
        )
      ])
  }
];

/** scroll-x 必须 ≥ 列宽和，否则 naive-ui 会压缩列导致折行（§4.11）。
 *  清单列宽以后会随字段增减变动，改成按列宽和现算，不再手抄一个固定数字。 */
const configScrollX = computed(() => configColumns.reduce((sum, c) => sum + (c.width || 0), 0));

onMounted(() => {
  loadMeta();
  fetchData();
});

onUnmounted(stopPolling);
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="品种">
          <NSelect
            v-model:value="searchParams.option_name"
            :options="optionNameOptions"
            clearable
            placeholder="不选=全部"
            style="width: 170px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NSelect
            v-model:value="searchParams.end_month"
            :options="endMonthOptions"
            clearable
            placeholder="不选=全部"
            style="width: 130px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="searchParams.option_type"
            :options="typeOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="合约ID">
          <NInput
            v-model:value="searchParams.contract_id"
            clearable
            placeholder="模糊匹配，回车搜索"
            style="width: 180px"
            @keyup.enter="handleSearch"
          />
        </NFormItem>
        <NFormItem label="起始日期">
          <NDatePicker
            v-model:formatted-value="searchParams.trade_date"
            type="date"
            value-format="yyyy-MM-dd"
            clearable
            placeholder="不选=全部"
            style="width: 150px"
            @update:formatted-value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>

        <!-- 行情同步：搜索区的**批量任务按钮**（不针对某一行、走任务化、有审计） -->
        <NFormItem class="ml-auto">
          <NSpace align="center">
            <NButton @click="openConfigDrawer">
              <template #icon><SvgIcon icon="mdi:format-list-checks" /></template>
              同步清单
            </NButton>
            <NButton type="primary" :loading="syncLoading || syncRunning" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              行情同步
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>

      <!-- 同步进度：按「组」报，不给单纯百分比（耗时在接口请求上） -->
      <div v-if="syncTask" class="mt-8px">
        <NProgress
          type="line"
          :percentage="Number(syncTask.progress || 0)"
          :status="syncTask.status === 'failed' ? 'error' : syncTask.status === 'stopped' ? 'warning' : undefined"
          :processing="syncRunning"
        />
        <div class="mt-4px text-12px" style="color: #888">
          {{ syncProgressText }}
          <span v-if="syncTask.result && !syncRunning">
            · 新增 {{ (syncTask.result as any).row_insert ?? 0 }} 行 · 更新
            {{ (syncTask.result as any).row_update ?? 0 }} 行 · 跳过 {{ (syncTask.result as any).row_skip ?? 0 }} 行
          </span>
        </div>
        <div class="mt-4px text-12px" style="color: #999">
          进度按「组」（一个品种×到期月 = 一次接口请求）报，条数按
          <b>行</b>
          报——两者不同口径，别看混。
        </div>
      </div>

      <div class="mt-8px text-12px" style="color: #999">
        最新行情日：
        <b>{{ latest.latest_trade_date || '（暂无数据）' }}</b>
        <template v-if="latest.sync_time">· 最近同步 {{ latest.sync_time }}</template>
        ·
        <b>不填「起始日期」= 全部历史</b>
        （按交易日倒序，最新在前）；填了则
        <b>从该日起筛到最新</b>
        ，不是只看那一天。 · 数据由「
        <b>同步清单</b>
        」驱动，点「行情同步」一次拉完（后台任务，进度按组显示）。 「到期月」按
        <b>到期日所在月</b>
        筛选（au2612 的到期日在 11 月，故归入 202611；IO2611 与它同月）。
        <b>结算价 / delta 只有商品期权可得</b>
        ：股指与 ETF 期权的接口本就没有这两个字段，显示
        <span style="color: #bbb">-</span>
        是正常现象，不拿前结价冒充结算价。
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :row-key="marketRowKey"
        :scroll-x="scrollX"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!--
 after-leave 刷主表：券商码在主表也有一列（来自 config join），
         抽屉里改完不重拉的话那一列会停在旧值，核账时容易看错 
-->
    <NDrawer v-model:show="configDrawer" width="66%" placement="right" @after-leave="fetchData">
      <NDrawerContent closable>
        <template #header>
          <div class="flex w-full items-center justify-between pr-16px">
            <span>期权行情同步清单</span>
            <NSpace>
              <NButton size="small" @click="goOptionInfo">
                <template #icon><SvgIcon icon="mdi:book-open-variant" /></template>
                合约字典
              </NButton>
              <NButton size="small" :loading="configLoading" @click="loadConfigs">刷新</NButton>
            </NSpace>
          </div>
        </template>
        <div class="mb-8px text-12px" style="color: #999">
          这张清单只决定「
          <b>要同步哪些合约、怎么拉</b>
          」（合约ID / 券商码 / 品种 / 到期月 / 启用）。
          <b>合约规格（方向 / 行权价 / 乘数 / 到期日 / 保证金族）不在这张清单里</b>
          ——权威是交易所合约字典，要看规格去
          <b>合约字典</b>
          页（本页 10-27 起不再重复展示）。 新增合约也从字典里选，不再手打代码。
          商品期权（沪金）的到期月记为「全部月份」：接口一次返回当日全部到期月， 填实际月份会让人以为只拉了一个月。
          <br />
          <b>券商码可直接点开下拉改</b>
          （候选来自账单标的表，已按持仓中优先排序、剔除资金流水占位码；已被别的合约占用的码
          灰掉不可选）。清空会让该合约
          <b style="color: #d03050">退出风险情景推演</b>
          ——系统靠它认领账单持仓，匹配不上是直接报错。
        </div>
        <NDataTable
          :columns="configColumns"
          :data="configRows"
          :loading="configLoading"
          :row-key="configRowKey"
          :pagination="configPagination"
          :scroll-x="configScrollX"
        />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/* 列宽不足时 naive-ui 默认折行，不是省略号；统一 nowrap 保证一行显示（配 scroll-x 横向滚动） */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
