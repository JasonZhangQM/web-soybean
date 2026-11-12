<script setup lang="ts">
/**
 * 推演工作台（POST /irs/simulate）
 *
 * 左栏：今日标的卡片全量信息（TodayCard 复用）+ 假设价滑块；
 * 右栏：与抽屉档位 Tab 同构 —— SectionBar 直接分节（组合推演 / 改价小结 / 逐仓明细 / 分账户），
 * 每个区域不套卡片；随滑块联动实时重算。
 *
 * 口径全部后端算（铁律 4.5）：pct/shift/BS 重估/义务仓保证金逐档重估/budget 预算读数。
 * 前端只做滑块几何（轴域、marks）、批量档位套用与 debounce 调度；请求带序号防竞态。
 * 顶栏「行情更新」与 `/irs/underlying-monitors` 列表页「行情」按钮同接口（syncIrs + executeSync）。
 *
 * 双锚点（探针 _probe_um_simulate.py 验收）：
 * - 全滑块回现价时与风险看板逐值一致；
 * - 单标的假设价=档位价时与到档情景逐值一致。
 */
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NButtonGroup, NEmpty, NSlider, NTag, NTooltip } from 'naive-ui';
import { fetchToday, simulateIrs, syncIrs } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import {
  deltaPnlHeader,
  fmtMoney as fmtMoneyStd,
  fmtPrice as fmtPriceStd,
  fmtRatio,
  levelColor,
  metricHeader,
  pnl as pnlStd,
  ratioLevel
} from '@/views/irs/risk-board/modules/utils';
import TodayCard from '@/views/today/modules/TodayCard.vue';
/** 右侧各分节的标题栏：直接复用标的监测抽屉档位 Tab 的 SectionBar（灰底横条 + 左色条），样式源唯一 */
import SectionBar from '@/views/irs/underlying-monitors/modules/SectionBar.vue';

defineOptions({ name: 'IrsSimulatePage' });

const router = useRouter();

// ---------------- 左栏：今日标的清单（与今日页同源 GET /irs/today） ----------------
const loading = ref(false);
const items = ref<Api.Irs.TodayItem[]>([]);

async function load() {
  loading.value = true;
  try {
    const { data, error } = await fetchToday();
    if (!error && data) items.value = data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function goDetail(it: Api.Irs.TodayItem) {
  router.push({ name: 'irs_underlying-monitors', query: { um: it.symbol } });
}

// ---------------- 假设价状态与滑块几何 ----------------
/** {标的代码: 假设价}；不设 = 现价（用 Map 规避动态 delete，reactive Map 可深度监听） */
const overrides = reactive(new Map<string, number>());

/** 五档价（TodayItem.pp 透传）；无版本标的为空数组 */
function tierSeq(it: Api.Irs.TodayItem): number[] {
  const pp = it.pp;
  if (!pp) return [];
  return [pp.pp_el, pp.pp_l, pp.pp_m, pp.pp_h, pp.pp_eh].map(v => (v == null ? NaN : Number(v)));
}

/** 滑块轴域：有五档 = [min(五档,现价)×0.9, max(五档,现价)×1.1]；无五档 = 现价×[0.7,1.3] */
function axisOf(it: Api.Irs.TodayItem) {
  const price = it.price == null ? null : Number(it.price);
  if (price == null || price <= 0) return null;
  const seq = tierSeq(it).filter(v => !Number.isNaN(v) && v > 0);
  if (seq.length === 5) {
    return { lo: Math.min(...seq, price) * 0.9, hi: Math.max(...seq, price) * 1.1, tiers: seq };
  }
  return { lo: price * 0.7, hi: price * 1.3, tiers: [] };
}

/** 滑块步长按量纲：跨度 >500 取 1，>50 取 0.1，否则 0.01 */
function stepOf(ax: { lo: number; hi: number } | null) {
  if (!ax) return 1;
  const span = ax.hi - ax.lo;
  if (span > 500) return 1;
  if (span > 50) return 0.1;
  return 0.01;
}

/** 五档 marks（NSlider marks：{位置值: 标签}；档位价不在轴内跳过） */
function marksOf(it: Api.Irs.TodayItem) {
  const ax = axisOf(it);
  if (!ax || !ax.tiers.length) return undefined;
  const names = ['极低', '低', '中', '高', '极高'];
  const marks: Record<number, string> = {};
  ax.tiers.forEach((v, i) => {
    if (v >= ax.lo && v <= ax.hi) marks[Number(v.toFixed(2))] = names[i];
  });
  return Object.keys(marks).length ? marks : undefined;
}

// ---------------- 顶栏：一键批量套用档位 ----------------
type BatchKey = 'pp_el' | 'pp_l' | 'pp_m' | 'pp_h' | 'pp_eh' | 'price';

/** 六个快捷档：前五个取各标的 TodayItem.pp（与滑块 marks 同源），「现价」= 全部回现价 */
const BATCH_TIERS: Array<{ label: string; key: BatchKey }> = [
  { label: '极低', key: 'pp_el' },
  { label: '低', key: 'pp_l' },
  { label: '中', key: 'pp_m' },
  { label: '高', key: 'pp_h' },
  { label: '极高', key: 'pp_eh' },
  { label: '现价', key: 'price' }
];

/** 当前生效的批量档位；手动拖滑块 / 单个回现价后置 null（= 自定义组合），用于按钮高亮 */
const activeBatch = ref<BatchKey | null>(null);

/**
 * 把全部标的的假设价设到同一档：每个标的取**自己的**档位价，不是同一个绝对值。
 * - 无版本 / 该档为空 / 非正数 ⇒ 跳过（保持现价），不把 0 / NaN 喂给滑块与后端；
 * - 档位价恰等于现价 ⇒ 不写 override，与 setHypo「现价即不设」语义一致。
 * clear + 多次 set 都在同一个同步块内 ⇒ watch 只合并触发一次 debounce 计算。
 */
function applyBatch(key: BatchKey) {
  overrides.clear();
  if (key !== 'price') {
    for (const it of items.value) {
      const raw = it.pp?.[key];
      const v = raw == null ? null : Number(raw);
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      if (it.price != null && Math.abs(v - Number(it.price)) < 1e-9) continue;
      overrides.set(it.symbol, v);
    }
  }
  activeBatch.value = key;
}

function setHypo(it: Api.Irs.TodayItem, v: number | null) {
  activeBatch.value = null;
  if (v == null || (it.price != null && Math.abs(Number(v) - Number(it.price)) < 1e-9)) {
    overrides.delete(it.symbol);
  } else {
    overrides.set(it.symbol, Number(v));
  }
}

function resetHypo(it: Api.Irs.TodayItem) {
  activeBatch.value = null;
  overrides.delete(it.symbol);
}

const changedCount = computed(() => overrides.size);

// ---------------- 右栏：推演结果（debounce 400ms，序号防竞态） ----------------
const ivMult = ref(1.0);
const result = ref<Api.Irs.SimulateResult | null>(null);
const simLoading = ref(false);
const simError = ref('');
let simSeq = 0;
let debounceTimer: number | undefined;

async function runSim() {
  // 显式调用（首屏 / 行情更新后）时撤掉 watch 排队的同一次请求，避免 400ms 内打两遍
  window.clearTimeout(debounceTimer);
  const seq = (simSeq += 1);
  simLoading.value = true;
  simError.value = '';
  try {
    const { data, error } = await simulateIrs({
      overrides: Object.fromEntries(overrides),
      // 主时点固定即期（2026-11-12 取消「即期 / 到期」切换，与标的五档风险指标一致）；
      // 逐仓 / 分账户两列 Δ 盈亏仍并列，到期列只作终局对照，不作为组合摘要口径。
      horizon: 'now',
      iv_mult: ivMult.value
    });
    if (seq !== simSeq) return; // 已有更新请求，丢弃旧响应
    if (error || !data) {
      simError.value =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '推演计算失败';
      result.value = null;
      return;
    }
    result.value = data;
  } finally {
    if (seq === simSeq) simLoading.value = false;
  }
}

watch([() => Array.from(overrides.entries()), ivMult], () => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(runSim, 400);
});

onMounted(() => {
  // 首次立即算一次 0% 基准（与风险看板对照）
  runSim();
});

/**
 * 顶栏「行情更新」：与 `/irs/underlying-monitors` 列表页「行情」按钮同一个接口
 * syncIrs('underlying-monitor')（gm current → 写 um.price → flush 触发 pv_* 钩子），
 * 反馈 / 防重复点击 / 状态分流全部复用 executeSync（含 no_data、error 不刷新的语义）。
 * 成功后重拉 GET /irs/today 拿新现价与五档，再重算推演；当前若停在某个批量档位，
 * 按新档位价重新套用一次，避免「新价配旧假设」。
 */
const quoteLoading = ref(false);

async function handleSyncQuote() {
  await executeSync(
    () => syncIrs('underlying-monitor'),
    quoteLoading,
    async () => {
      await load();
      if (activeBatch.value && activeBatch.value !== 'price') applyBatch(activeBatch.value);
      await runSim();
    }
  );
}

function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** 摘要卡 / 改价小结 / 滑块读数用紧凑格式（0 位小数）；表格一律走 utils 标准格式（2 位小数） */
function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPctN(v: number | null | undefined, digits = 2) {
  if (v == null) return '—';
  return `${(Number(v) * 100).toFixed(digits)}%`;
}

function signCls(v: number | null | undefined) {
  if (v == null || Math.abs(Number(v)) < 1e-9) return '';
  return Number(v) > 0 ? 'text-green-500' : 'text-red-500';
}

/**
 * 逐仓 / 分账户两表的数字格式与列头提示，全部对齐
 * `/irs/underlying-monitors` 抽屉「档位 → 某档持仓明细」（LevelScenarioTab.positionColumns）：
 * 金额 = fmtMoney（千分位 + 2 位小数、空 '-'），价格 = fmtPrice（最多 4 位、去尾零、空 '-'），
 * 盈亏 = pnl（亏红盈绿），保证金变化 = 带符号原值 + 占用增红减绿。
 * 本页摘要卡 / 改价小结 / 滑块仍用本地 fmtMoney（0 位小数），不属表格范围。
 */
/** 保证金变化：占用增加染红、减少染绿，显示带符号的原值（不取相反数） */
function marginDelta(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { style: { color: n > 0 ? '#d03050' : '#18a058' } }, `${n > 0 ? '+' : ''}${fmtMoneyStd(n)}`);
}

/** 风险度：4 位小数 + 分档配色（复用风险看板/档位 Tab 的同一套 utils） */
function ratioCell(v: number | null | undefined) {
  return h('span', { style: { color: levelColor(ratioLevel(v)) } }, fmtRatio(v));
}

/** 假设价读数（滑块下方）：假设 X（±pct%）· 落入 zone_at */
function hypoText(it: Api.Irs.TodayItem) {
  const v = overrides.get(it.symbol);
  if (v == null) return { main: '= 现价', zone: '' };
  const price = it.price == null ? null : Number(it.price);
  const pct = price ? (Number(v) / price - 1) * 100 : null;
  const zoneAt = result.value?.subjects[it.symbol]?.zone_at;
  return {
    main: `${fmtPrice(v)}（${pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}）`,
    zone: zoneAt ? ` · 落入「${zoneAt}」` : ''
  };
}

/** 标的显示名：未归属（显示「—」）为空串 */
function subjectLabel(r: Api.Irs.SimulatePositionRow) {
  return r.subject_name || r.subject || '';
}

/**
 * 排序唯一数据源：后端 `subject_exposure` = 各标的项下持仓「风险敞口」之和
 * （按 账户+合约 去重、NULL 不计入，静态人工值、不随假设价变化）。
 * 左栏卡片与右栏逐仓明细共用这一份，避免两侧口径漂移；未出现在 map 里的标的 = 0。
 */
const subjectExposure = computed<Record<string, number>>(() => result.value?.subject_exposure ?? {});

function exposureOfSubject(sym: string | null | undefined) {
  return sym ? (subjectExposure.value[sym] ?? 0) : 0;
}

/** 逐仓敞口：NULL（未设置）按 0 处理，排在有值的后面 */
function exposureOfRow(r: Api.Irs.SimulatePositionRow) {
  return Number(r.risk_exposure ?? 0);
}

/** 末级兜底：同敞口时保持顺序稳定 */
function tailOrder(a: Api.Irs.SimulatePositionRow, b: Api.Irs.SimulatePositionRow) {
  return (
    String(a.acct ?? '').localeCompare(String(b.acct ?? '')) ||
    String(a.name ?? '').localeCompare(String(b.name ?? '')) ||
    Number(a.strike ?? 0) - Number(b.strike ?? 0)
  );
}

/**
 * 左栏标的卡片：按标的项下持仓敞口合计倒序；同值按代码升序兜底（稳定）。
 * 推演结果未到达时保持 /irs/today 的原优先级顺序，不额外按代码重排、避免首屏跳变。
 */
const sortedItems = computed(() => {
  if (!Object.keys(subjectExposure.value).length) return items.value;
  return [...items.value].sort(
    (a, b) => exposureOfSubject(b.symbol) - exposureOfSubject(a.symbol) || a.symbol.localeCompare(b.symbol)
  );
});

/**
 * 右栏逐仓明细：① 按「标的项下持仓敞口合计」倒序（同标的聚拢，合计相同再按标的名/代码分开）；
 * ② 组内按逐仓「风险敞口」倒序；③ 未归属（—）固定排最后。
 * 列头不挂 sorter —— 排列顺序只有这一套，不允许点列头改写。
 * 改价行仍以底色高亮区分，_rk 供 row-key 稳定标识行（滑块连续拖动时不整表重建）。
 */
const positionRows = computed(() => {
  const rows = result.value?.position_rows ?? [];
  const sorted = [...rows].sort((a, b) => {
    if (!a.subject || !b.subject) {
      if (a.subject !== b.subject) return a.subject ? -1 : 1;
      return exposureOfRow(b) - exposureOfRow(a) || tailOrder(a, b);
    }
    return (
      exposureOfSubject(b.subject) - exposureOfSubject(a.subject) ||
      subjectLabel(b).localeCompare(subjectLabel(a), 'zh-Hans-CN') ||
      b.subject.localeCompare(a.subject) ||
      exposureOfRow(b) - exposureOfRow(a) ||
      tailOrder(a, b)
    );
  });
  return sorted.map((r, i) => ({ ...r, _rk: `${r.acct}/${r.name}/${r.kind}/${r.strike ?? ''}/${i}` }));
});

/**
 * Δ 盈亏列头「?」提示的统计范围：deltaPnlHeader 前两行（时点定义 / 时间价值）全站共用，
 * 末行 scopeLine 由调用方按统计粒度给。档位 Tab 默认写「只统计该标的项下持仓」，
 * 推演可多标的并行改价、且到期列含全组合时间价值归零，口径不同，故两份文案各自给（不可照抄）。
 * ⚠️ 冻结行只在即期列 Δ 恒 0；到期列所有期权（含冻结行）时间价值归零 ⇒ 只有 Σ即期Δ 可与组合摘要对账。
 */
/** 逐仓粒度：每行只统计该合约在假设价下的重估值 */
const SIM_POS_DELTA_SCOPE =
  '两列都是相对当前的 Δ（V(S1)−V(S0)），逐仓按该合约重估值统计。即期：改价未命中的持仓价格冻结、Δ 恒 0；到期：所有期权（含冻结行）时间价值归零，Δ 也含这部分 ⇒ 只有 Σ即期Δ 可与组合 Δ盈亏对账。证券/期货两列恒等，差异只来自期权；与「当前盈亏」账面口径基准不同，不可相加对账。';
/** 账户粒度：Σ 该账户全部持仓（与分账户表两列 Δ 对得上） */
const SIM_DELTA_SCOPE =
  '两列都是相对当前的 Δ（V(S1)−V(S0)），按账户全部持仓统计。即期：改价未命中的持仓价格冻结、Δ 恒 0；到期：所有期权（含冻结行）时间价值归零，Δ 也含这部分 ⇒ 只有 Σ即期Δ 可与组合 Δ盈亏对账。证券/期货两列恒等，差异只来自期权；与「当前盈亏」账面口径基准不同，不可相加对账。';

/**
 * 逐仓明细列：数字格式与列头提示对齐抽屉「档位 → 某档持仓明细」（LevelScenarioTab.positionColumns）。
 * - 金额 / 价格 / 盈亏 / 保证金变化一律走 utils 标准格式；只有两列 Δ 盈亏挂「?」提示，其余列纯标题（同档位 Tab）。
 * - 保留本页特有的「标的」「方向」两列：方向已表达多空，数量沿用绝对值口径，仅空值显示 '-'（同档位 Tab）。
 * - 列宽全部用 width（不用 minWidth）：scroll-x 按列宽和自动求和（🔒4.11）。
 *   NDataTable 不写 size（🔒4.7）：全局主题只压 medium 到 4px 8px，写 small 反而更高。
 */
const positionCols = computed(() => [
  {
    key: 'subject',
    title: '标的',
    width: 100,
    render: (r: Api.Irs.SimulatePositionRow) => r.subject_name || r.subject || '—'
  },
  { key: 'acct', title: '账户', width: 64 },
  { key: 'name', title: '合约', width: 170 },
  {
    key: 'dir',
    title: '方向',
    width: 84,
    render: (r: Api.Irs.SimulatePositionRow) => {
      if (r.kind === 'call' || r.kind === 'put') return `${r.kind === 'call' ? '购' : '沽'} ${fmtPriceStd(r.strike)}`;
      return r.qty != null && Number(r.qty) > 0 ? '多' : '空';
    }
  },
  {
    key: 'qty',
    title: '数量',
    width: 64,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => (r.qty == null ? '-' : String(Math.abs(Number(r.qty))))
  },
  {
    key: 'risk_exposure',
    title: '风险敞口',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => fmtMoneyStd(r.risk_exposure)
  },
  {
    key: 'price',
    title: '基准价→情景价',
    width: 150,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => `${fmtPriceStd(r.price_now)}→${fmtPriceStd(r.price_at)}`
  },
  {
    key: 'pf_now',
    title: '当前盈亏',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlStd(r.pf_now)
  },
  {
    key: 'delta_pnl_now',
    title: deltaPnlHeader('即期', SIM_POS_DELTA_SCOPE),
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlStd(r.delta_pnl_now)
  },
  {
    key: 'delta_pnl_expiry',
    title: deltaPnlHeader('到期', SIM_POS_DELTA_SCOPE),
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlStd(r.delta_pnl_expiry)
  },
  {
    key: 'margin_at',
    title: '到档保证金',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => fmtMoneyStd(r.margin_at)
  },
  {
    key: 'margin_delta',
    title: '保证金变化',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => marginDelta(r.margin_delta)
  }
]);

/**
 * 分账户风险指标：列集合、顺序、列宽、列头口径提示、金额格式全部对齐
 * `/irs/underlying-monitors` 抽屉「档位 → 某档·分账户风险指标」（LevelScenarioTab.accountColumns）。
 * 12 列 = 账户 / 风险敞口 / 账户当前盈亏 / 即期Δ / 到期Δ / 到档净值 / 客户权益 /
 * 保证金 / 真实风险度 / 交易所风险度 / 覆盖率 / 追保(模型)。
 * 数值全部后端现算，前端不自算（🔒4.13）；两张表均走 utils 标准数字格式。
 */
const ACCOUNT_NOTES = {
  exposure: [
    '账户层面风险敞口 = bills_group_acc.risk_exposure，即账户内各 Group 敞口之和，含该账户全部持仓；与标的归属无关。',
    '静态账面值，不随假设价或时点变化；NULL（全部未设置）显示「-」，不按 0 计。',
    '与逐仓表的按合约敞口口径不同，两者不可相加或对账。'
  ],
  coverage: [
    '= 该账户到档净值 ÷ 该账户保证金，即自有资金对保证金占用的覆盖倍数。',
    '净值为正时恰好是「真实风险度」的倒数：≥1 表示自有资金够覆盖占用，<1 表示保证金已超过自有资金。',
    '保证金为 0 时显示「-」；净值 ≤0 时会显示 0 或负数。只用本账户数据，不是组合口径。'
  ],
  breached: [
    '模型推演的越线标记，不是券商 / 交易所实际发出的追保通知。',
    '判据：该账户到档净值 ≤ 0，或交易所风险度（保证金 ÷ 客户权益）≥ 1；空账户（无净值无保证金）豁免。',
    '只判交易所口径，不看真实风险度：真实 ≥1 而交易所 <1 时这里仍显示「-」，须另行留意。'
  ]
};

const accountCols = computed(() => [
  { key: 'account', title: '账户', width: 40 },
  {
    key: 'risk_exposure',
    title: metricHeader('风险敞口', ACCOUNT_NOTES.exposure),
    width: 120,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoneyStd(a.risk_exposure)
  },
  {
    key: 'pf_now',
    title: '账户当前盈亏',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlStd(a.pf_now)
  },
  {
    key: 'delta_pnl_now',
    title: deltaPnlHeader('即期', SIM_DELTA_SCOPE),
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlStd(a.delta_pnl_now)
  },
  {
    key: 'delta_pnl_expiry',
    title: deltaPnlHeader('到期', SIM_DELTA_SCOPE),
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlStd(a.delta_pnl_expiry)
  },
  {
    key: 'net_at',
    title: '到档净值',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoneyStd(a.net_at)
  },
  {
    key: 'eq_at',
    title: '客户权益',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoneyStd(a.eq_at)
  },
  {
    key: 'margin_at',
    title: '保证金',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoneyStd(a.margin_at)
  },
  {
    key: 'real',
    title: '真实风险度',
    width: 100,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => ratioCell(a.real)
  },
  {
    key: 'exch',
    title: '交易所风险度',
    width: 100,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => ratioCell(a.exch)
  },
  {
    key: 'coverage',
    title: metricHeader('覆盖率', ACCOUNT_NOTES.coverage),
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtRatio(a.coverage)
  },
  {
    key: 'breached',
    title: metricHeader('追保(模型)', ACCOUNT_NOTES.breached),
    width: 130,
    render: (a: Api.Irs.SimulateAccount) =>
      a.breached ? h(NTag, { type: 'error', size: 'small' }, { default: () => '越线' }) : '-'
  }
]);

/** scroll-x = 列宽和：加列/改列宽不再需要手改常量（🔒4.11） */
function sumWidth(cols: Array<{ width?: number }>) {
  return cols.reduce((s, c) => s + Number(c.width ?? 0), 0);
}
const scrollX = computed(() => sumWidth(positionCols.value as Array<{ width?: number }>));
const accountScrollX = computed(() => sumWidth(accountCols.value as Array<{ width?: number }>));

const rowProps = (r: Api.Irs.SimulatePositionRow) => ({
  style: r.changed ? 'background: rgba(93,202,165,0.08);' : ''
});
</script>

<template>
  <div class="h-full flex flex-col gap-12px p-16px">
    <!-- 顶栏：IV / 批量档位 / 行情更新；时点口径固定即期，已无切换控件 -->
    <div class="flex flex-wrap items-center gap-12px">
      <span class="text-16px font-600">推演工作台</span>
      <NTag size="small" :bordered="false" round>
        {{ changedCount ? `${changedCount} 个标的已改动` : '全部现价（0% 基准）' }}
      </NTag>
      <div class="flex items-center gap-6px text-12px">
        <span class="text-gray-400">IV ×</span>
        <NSlider
          v-model:value="ivMult"
          :min="0.5"
          :max="2"
          :step="0.05"
          :format-tooltip="(v: number) => `×${v.toFixed(2)}`"
          class="w-120px"
          :disabled="simLoading"
        />
        <span class="w-40px">{{ ivMult.toFixed(2) }}</span>
      </div>
      <div class="ml-auto flex items-center gap-6px">
        <span class="text-12px text-gray-400">批量设置</span>
        <NTooltip trigger="hover">
          <template #trigger>
            <NButtonGroup size="tiny">
              <NButton
                v-for="t in BATCH_TIERS"
                :key="t.key"
                size="tiny"
                :type="activeBatch === t.key ? 'primary' : 'default'"
                :disabled="t.key === 'price' && !changedCount"
                @click="applyBatch(t.key)"
              >
                {{ t.label }}
              </NButton>
            </NButtonGroup>
          </template>
          按每个标的自身的五档价，一键把全部标的设到同一档；无该档位的标的保持现价。「现价」= 全部回现价。
        </NTooltip>
      </div>
      <NTooltip trigger="hover">
        <template #trigger>
          <NButton size="tiny" :loading="quoteLoading" @click="handleSyncQuote">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            行情更新
          </NButton>
        </template>
        同步实时行情（与标的监测列表页「行情」按钮同接口），成功后刷新现价 / 五档并重算推演。
      </NTooltip>
      <NButton size="tiny" text @click="load">刷新标的</NButton>
    </div>

    <!-- 左右两栏 -->
    <div class="min-h-0 flex flex-1 gap-12px">
      <!-- 左栏：标的卡片 + 滑块（按标的项下持仓敞口合计倒序） -->
      <div class="w-380px flex-none overflow-y-auto pr-4px">
        <div class="mb-8px text-11px text-gray-400">按标的项下持仓风险敞口合计倒序</div>
        <NEmpty v-if="!items.length && !loading" description="还没有标的监测标的" class="mt-24px" />
        <div class="flex flex-col gap-12px">
          <TodayCard
            v-for="it in sortedItems"
            :key="it.symbol"
            :item="it"
            :hypo-price="overrides.get(it.symbol) ?? null"
            :changed="overrides.has(it.symbol)"
            @detail="goDetail(it)"
          >
            <template #footer>
              <div class="border-t border-gray-100 pt-8px">
                <NSlider
                  :value="overrides.get(it.symbol) ?? it.price ?? 0"
                  :min="axisOf(it)?.lo"
                  :max="axisOf(it)?.hi"
                  :step="stepOf(axisOf(it))"
                  :marks="marksOf(it)"
                  :tooltip-formatter="(v: number) => fmtPrice(v)"
                  :disabled="!it.price"
                  @update:value="(v: number) => setHypo(it, v)"
                />
                <div class="mt-6px flex items-center justify-between text-12px">
                  <span :class="overrides.has(it.symbol) ? 'text-green-500' : 'text-gray-400'">
                    假设 {{ hypoText(it).main }}{{ hypoText(it).zone }}
                  </span>
                  <NButton v-if="overrides.has(it.symbol)" size="tiny" text @click="resetHypo(it)">回现价</NButton>
                </div>
              </div>
            </template>
          </TodayCard>
        </div>
      </div>

      <!-- 右栏：推演详情 -->
      <div class="min-w-0 flex-1 overflow-y-auto">
        <NEmpty v-if="simError" :description="simError" class="mt-24px" />
        <template v-else-if="result">
          <!-- 组合推演：与档位 Tab 一样，SectionBar 直接分节、不套卡片 -->
          <SectionBar title="组合推演">
            <NTag size="tiny" :bordered="false" round>主时点 即期</NTag>
            <NTag size="tiny" :bordered="false">IV ×{{ result.iv_mult.toFixed(2) }}</NTag>
            <span class="text-12px text-gray-400">
              引擎 {{ result.engine_ver }} · {{ result.as_of || '—' }}
              <template v-if="result.stale_days != null && result.stale_days > 0">
                ·
                <span class="text-orange-500">行情滞后 {{ result.stale_days }} 个交易日</span>
              </template>
            </span>
            <template #actions>
              <span v-if="simLoading" class="text-12px text-gray-400">计算中…</span>
            </template>
          </SectionBar>
          <div class="mb-16px flex flex-wrap gap-12px text-12px">
            <span>
              净资产
              <b>{{ fmtMoney(result.combo.net_at) }}</b>
            </span>
            <span>
              保证金
              <b>{{ fmtMoney(result.combo.margin_total) }}</b>
              <span class="ml-4px" :class="signCls(result.combo.margin_total - result.baseline_combo.margin_total)">
                （{{ result.combo.margin_total - result.baseline_combo.margin_total >= 0 ? '+' : ''
                }}{{ fmtMoney(result.combo.margin_total - result.baseline_combo.margin_total) }}）
              </span>
            </span>
            <span>
              风险度
              <b>{{ fmtPctN(result.combo.real) }}</b>
              <span class="text-gray-400">真实</span>
              <span class="mx-4px text-gray-300">|</span>
              <b>{{ fmtPctN(result.combo.exch) }}</b>
              <span class="text-gray-400">交易所</span>
            </span>
            <span :class="signCls(-result.combo.loss)">
              组合 Δ盈亏
              <b>{{ fmtMoney(-result.combo.loss) }}</b>
            </span>
            <span>
              预算（现价基准）
              <NTag
                size="tiny"
                :bordered="false"
                :type="
                  result.budget.summary.verdict === 'ok'
                    ? 'success'
                    : result.budget.summary.verdict === 'block'
                      ? 'error'
                      : 'warning'
                "
              >
                {{ result.budget.summary.verdict }}
              </NTag>
              余量
              <b>{{ fmtMoney(result.budget.summary.headroom_total) }}</b>
            </span>
            <NTag v-if="result.budget.summary.blocked_accounts.length" size="tiny" :bordered="false" type="error" round>
              禁开：{{ result.budget.summary.blocked_accounts.join(' / ') }}
            </NTag>
          </div>

          <!-- 改价标的假设态小结 -->
          <template v-if="changedCount">
            <SectionBar :title="`改价标的假设态（${changedCount}）`">
              <span class="text-12px text-gray-400">按主时点即期口径；Σ即期Δ盈亏 = 组合 Δ盈亏，可对账</span>
            </SectionBar>
            <div class="mb-16px flex flex-col gap-8px">
              <div
                v-for="(sym, i) in result.changed_symbols"
                :key="sym"
                class="flex flex-wrap items-center gap-8px text-12px"
                :class="i > 0 ? 'border-t border-gray-100 pt-8px' : ''"
              >
                <span class="font-500">{{ result.subjects[sym]?.name || sym }}</span>
                <span class="text-gray-400">{{ sym }}</span>
                <span>
                  假设
                  <b>{{ fmtPrice(result.subjects[sym]?.price_at) }}</b>
                  （{{ (Number(result.subjects[sym]?.pct) * 100).toFixed(1) }}%）
                </span>
                <NTag size="tiny" :bordered="false" type="info">
                  {{ result.subjects[sym]?.zone_now }} → {{ result.subjects[sym]?.zone_at }}
                </NTag>
                <span :class="signCls(result.subjects[sym]?.delta_pnl)">
                  Δ盈亏
                  <b>{{ fmtMoney(result.subjects[sym]?.delta_pnl) }}</b>
                </span>
                <span>
                  到档浮盈
                  <b :class="signCls(result.subjects[sym]?.pf_at_level)">
                    {{ fmtMoney(result.subjects[sym]?.pf_at_level) }}
                  </b>
                </span>
                <span>
                  保证金Δ
                  <b>{{ fmtMoney(result.subjects[sym]?.margin_delta) }}</b>
                </span>
                <!-- 假设价剧本命中判定 -->
                <span
                  v-for="p in result.subjects[sym]?.plans_at ?? []"
                  :key="p.seq"
                  class="text-11px"
                  :class="p.hit_at ? 'text-orange-500 font-500' : 'text-gray-400'"
                >
                  剧本{{ p.trade_symbol }} {{ p.b_s }}{{ p.o_c || '' }} @ {{ fmtPrice(p.effective_trigger) }}
                  {{ p.hit_at ? '命中' : '未到' }}
                </span>
              </div>
            </div>
          </template>

          <!-- 逐仓明细：标题栏只放短标签，长口径说明留内容区（与档位 Tab 的分工一致） -->
          <SectionBar :title="`逐仓明细（${positionRows.length} 仓）`">
            <NTag size="small" :bordered="false">按标的敞口合计 / 逐仓敞口倒序 · 改价行高亮</NTag>
            <span class="text-12px text-gray-400">即期 / 到期两列 Δ 盈亏并列，列名固定</span>
          </SectionBar>
          <div class="mb-8px text-12px text-gray-400">
            先按标的项下持仓敞口合计倒序聚拢，组内按逐仓风险敞口倒序，未归属固定排最后；列头不可切换排序。
            组合摘要与改价小结按即期口径，Σ即期Δ盈亏 = 组合 Δ盈亏，可对账。
          </div>
          <!--
             <div class="mb-8px text-11px text-gray-400">
              数字格式与档位 Tab「某档持仓明细」一致（金额 2 位小数、价格最多 4 位、空值 '-'）；
              「当前盈亏」为账单账面静态浮盈，Δ盈亏为模型盯市增量，两者基准不同、不可相加对账；
              「风险敞口」为人工确认值，空显示 '-'；两列 Δ 盈亏列头「?」可查时点与统计范围口径。
            </div> 
-->
          <NDataTable
            :columns="positionCols"
            :data="positionRows"
            :row-props="rowProps"
            :row-key="(r: any) => r._rk"
            :scroll-x="scrollX"
            table-layout="fixed"
            :bordered="false"
            class="sim-data-table mb-16px"
          />

          <!-- 分账户风险指标（列集合与档位 Tab 逐列一致） -->
          <SectionBar :title="`分账户风险指标（${result.accounts.length} 个账户）`">
            <NTag size="small" :bordered="false" type="info">列集合与档位 Tab 逐列一致</NTag>
            <span class="text-12px text-gray-400">即期 / 到期两列 Δ 盈亏并列，列名固定</span>
          </SectionBar>
          <div class="mb-8px text-12px text-gray-400">
            组合摘要按即期口径，Σ即期Δ盈亏 = 组合 Δ盈亏，可对账；追保只判交易所口径。
          </div>
          <!--
 <div class="mb-8px text-11px text-gray-400">
              「账户当前盈亏」为账户层面全部持仓账面浮盈，两列 Δ盈亏为账户全部持仓的模型盯市增量，
              两者基准不同，不可相加对账；「风险敞口」为 bills_group_acc 的人工静态值，含账户全部持仓、与标的归属无关。
              追保只判交易所口径；真实口径 ≥1 而交易所口径 &lt;1 时须单独留意；空账户不展示。
            </div> 
-->
          <NDataTable
            :columns="accountCols"
            :data="result.accounts"
            :scroll-x="accountScrollX"
            table-layout="fixed"
            :bordered="false"
            class="sim-data-table mb-16px"
          />

          <!-- 口径说明（预留分节，同样不套卡片） -->
          <!--
 <div>
            <div class="text-12px text-gray-400">口径与告警（{{ result.warnings.length }} 条）</div>
            <ul class="mt-4px list-disc pl-18px text-11px text-gray-400 leading-relaxed">
              <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              <li>预算读数为现价基准（0% 与 +15% 全组同跌），不随滑块假设价变化。</li>
            </ul>
          </div> 
-->
        </template>
        <NEmpty v-else description="拖动左侧滑块开始推演" class="mt-48px" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 与「档位 tab」三张表逐项对齐（UnderlyingDataTable + LevelScenarioTab 的做法）：
 * 1. 单元格一律不折行 —— 合约名（CFFEX.IO2611-P-4000）在窄列里会断成两行，把行高撑成两倍。
 * 2. 行高收到 2px：全局主题把 medium 的 th/td padding 压到 4px 8px，档位 tab 再收到
 *    2px 8px，这里必须一致，否则同一份数据在推演页比档位 tab 高一档。
 * 3. 不开 single-line=false —— 那是「网格竖线」，全站只有本页曾这么写，属异类；
 *    默认 true 与列表页、抽屉、风险看板所有表一致。
 * 必须用 :deep()——th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上。
 * 配合列宽和（scroll-x）与 table-layout="fixed"，列宽才是硬约束（🔒4.11）。
 */
.sim-data-table :deep(.n-data-table-th),
.sim-data-table :deep(.n-data-table-td) {
  white-space: nowrap;
  padding-top: 2px;
  padding-bottom: 2px;
}

/*
 * 2026-11-12 起右侧各区块不再套 NCard：与抽屉档位 Tab 完全同构 ——
 * SectionBar 自带 margin 12px 0 8px + 灰底左色条即为唯一分隔，内容统一 mb-16px，
 * 底色 / 左色条 / 字号 / 明暗主题适配全由 SectionBar 决定，本页不另写卡片样式（防样式漂移）。
 */
</style>
