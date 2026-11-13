<script setup lang="ts">
/**
 * 账户总表（/risk 右栏 ①，2026-11-13 合并「账户风险列表」+「分账户风险指标」）
 *
 * 两路数据按账户 join，行集实测一致（board 过滤空账户后 5 个 = sim.accounts 5 个）：
 * - board.accounts / budget（GET /irs/risk-board）：现价基准静态卡，不随滑块变；
 * - sim.accounts / combo（POST /irs/simulate）：当前假设价的到档指标，每次滑块 debounce 重算。
 * 0% 基准时 net_at=net0、margin_at=margin、eq_at=eq、real/exch 逐值相等（接口实测），
 * 两套并列后在现价时数值相同属预期，改价后才分叉 —— 用户要的正是这个对照。
 *
 * 保留独有交互：点击行切账户视角（联动②③与 KPI 卡）、组合行 ALL、可开额度。
 * 账户列只显示名称，不贴越线标签；档位越线看 ② 压力表的「追保」列，风险高低看两组风险度着色。
 * 组合行到档值取 combo / baseline_combo：到档权益（Σ各账户 eq_at）、覆盖率 R/E、保证金变化
 * 全部由后端 _combo 直接给，前端不自算（🔒4.13）。真实风险度(R) 在净值 ≤ 0 时后端返回 null
 * （穿仓只看净值，分母非正不编造负数）⇒ 前端在两组风险度列的 R 半边改显「穿仓」标签。
 *
 * NDataTable 不写 size（🔒4.7）；scroll-x 按叶子列宽和自动求和（🔒4.11）。
 */
import { computed, h } from 'vue';
import type { DataTableColumns } from 'naive-ui';
import {
  bindingLabel,
  coveragePair,
  deltaPnlHeader,
  fmtMoney,
  fmtMoneyShort,
  isBusted,
  levelColor,
  marginDelta,
  metricHeader,
  pnl,
  ratioPair,
  verdictLevel
} from './utils';

defineOptions({ name: 'AccountRiskList' });

const props = defineProps<{
  /** 风险看板静态卡：现价基准 / 风险预算 / 账户清单 */
  board: Api.Irs.RiskBoard;
  /** 当前账户视角：ALL 或具体账户 */
  account: string;
  /** 当前滑块假设价的推演结果：到档组唯一数据源 */
  sim: Api.Irs.SimulateResult;
}>();

const emit = defineEmits<{ (e: 'select', account: string): void }>();

/** 到档组读数；null = 后端判为不适用（分母非正 / 无基准）或 join 未命中，显示 '-'、不伪造 0 */
interface AtRow {
  delta_pnl_now: number | null;
  delta_pnl_expiry: number | null;
  net_at: number | null;
  eq_at: number | null;
  margin_at: number | null;
  margin_delta: number | null;
  real: number | null;
  exch: number | null;
  /** 覆盖率 R（真实口径） */
  coverage: number | null;
  /** 覆盖率 E（交易所口径） */
  coverage_exch: number | null;
}

interface AccountRow {
  /** 账户名；ALL 表示组合 */
  account: string;
  /** 账户卡；组合行为 null */
  card: Api.Irs.RiskBoardAccount | null;
  net: number;
  eq: number;
  margin: number;
  real: number | null;
  exch: number | null;
  /** 账户风险敞口（人工确认口径）；null = 未设置 */
  risk_exposure: number | null;
  /** 账户账面浮盈（bills_group_acc.pf_total） */
  pf_now: number;
  /** 预算卡；组合行为 null */
  budget: Api.Irs.BudgetAccount | null;
  /** 当前假设(到档)指标 */
  at: AtRow;
}

/** 账户粒度 Δ 盈亏列头口径（自 index.vue 迁入）；与逐仓粒度的统计范围不同，勿照抄 */
const SIM_DELTA_SCOPE =
  '两列都是相对当前的 Δ（V(S1)−V(S0)），按账户全部持仓统计。即期：改价未命中的持仓价格冻结、Δ 恒 0；到期：所有期权（含冻结行）时间价值归零，Δ 也含这部分 ⇒ 只有 Σ即期Δ 可与组合 Δ盈亏对账。证券/期货两列恒等，差异只来自期权；与「当前盈亏」账面口径基准不同，不可相加对账。组合行为各账户之和。';

/** 列头口径说明：风险敞口 / 覆盖率(R/E)（在「分账户风险指标」原文基础上补了 R/E 两口径） */
const ACCOUNT_NOTES = {
  exposure: [
    '账户层面风险敞口 = bills_group_acc.risk_exposure，即账户内各 Group 敞口之和，含该账户全部持仓；与标的归属无关。',
    '静态账面值，不随假设价或时点变化；NULL（全部未设置）显示「-」，不按 0 计。',
    '与逐仓表的按合约敞口口径不同，两者不可相加或对账。'
  ],
  coverage: [
    'R（真实）= 该账户到档净值 ÷ 该账户保证金，即自有资金对保证金占用的覆盖倍数；净值为正时恰好是「到档风险度(R)」的倒数。',
    'E（交易所）= 该账户到档权益 ÷ 该账户保证金（分母含融资）；恰好是「到档风险度(E)」的倒数。融资为正时 E > R，两者差额就是融资撑出来的覆盖倍数。',
    'R ≥ 1 表示自有资金够覆盖占用；<1 表示保证金已超过自有资金。保证金为 0 时两值都显示「-」；净值 ≤0 时 R 会显示 0 或负数，风险度(R)那半边改显示「穿仓」标签。',
    '组合行 R = 组合到档净值 ÷ 合计保证金、E = Σ各账户到档权益 ÷ 合计保证金，与逐账户同式，不是各账户覆盖率的平均。'
  ]
};

function nullAt(): AtRow {
  return {
    delta_pnl_now: null,
    delta_pnl_expiry: null,
    net_at: null,
    eq_at: null,
    margin_at: null,
    margin_delta: null,
    real: null,
    exch: null,
    coverage: null,
    coverage_exch: null
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 组合行在前，账户行按风险敞口倒序（null = 未设置排最后，同账户内按名称稳定排序）。
 * 空账户（无净值且无保证金）整行过滤：列表只看有仓账户，豁免口径由后端判定兜底。
 */
const rows = computed<AccountRow[]>(() => {
  const finTotal = Object.values(props.board.accounts).reduce((s, a) => s + (a.fin ?? 0), 0);
  const simAccounts = props.sim.accounts ?? [];

  /** 组合行 ALL：到档值全部取后端 combo（含 Σ账户 Δ），两个风险度口径分母非正时后端给 null */
  const allAt: AtRow = {
    delta_pnl_now: round2(simAccounts.reduce((s, a) => s + Number(a.delta_pnl_now ?? 0), 0)),
    delta_pnl_expiry: round2(simAccounts.reduce((s, a) => s + Number(a.delta_pnl_expiry ?? 0), 0)),
    net_at: props.sim.combo.net_at,
    eq_at: props.sim.combo.eq_at,
    margin_at: props.sim.combo.margin_total,
    margin_delta: props.sim.combo.margin_delta,
    real: props.sim.combo.real,
    exch: props.sim.combo.exch,
    coverage: props.sim.combo.coverage,
    coverage_exch: props.sim.combo.coverage_exch
  };
  const allRow: AccountRow = {
    account: 'ALL',
    card: null,
    net: props.board.net_total,
    eq: props.board.net_total + finTotal,
    margin: props.board.margin_total,
    real: props.board.real_total,
    exch: props.board.grid.sync?.['0.0']?.ALL?.exch ?? null,
    risk_exposure: props.board.risk_exposure_total ?? null,
    pf_now: props.board.pf_now_total,
    budget: null,
    at: allAt
  };

  const acctRows = Object.keys(props.board.accounts)
    .sort()
    .map(name => {
      const card = props.board.accounts[name];
      const s = simAccounts.find(a => a.account === name);
      const at: AtRow = s
        ? {
            delta_pnl_now: s.delta_pnl_now,
            delta_pnl_expiry: s.delta_pnl_expiry,
            net_at: s.net_at,
            eq_at: s.eq_at,
            margin_at: s.margin_at,
            margin_delta: s.margin_delta,
            real: s.real,
            exch: s.exch,
            coverage: s.coverage,
            coverage_exch: s.coverage_exch
          }
        : nullAt();
      return {
        account: name,
        card,
        net: card.net0,
        eq: card.eq,
        margin: card.margin,
        real: card.real,
        exch: card.exch,
        risk_exposure: card.risk_exposure ?? null,
        pf_now: card.pf_now,
        budget: props.board.budget.accounts[name] ?? null,
        at
      };
    })
    .filter(r => !(Math.abs(r.net) < 1e-6 && Math.abs(r.margin) < 1e-6))
    .sort((a, b) => {
      const ea = a.risk_exposure;
      const eb = b.risk_exposure;
      if (ea === null && eb === null) return a.account.localeCompare(b.account);
      if (ea === null) return 1;
      if (eb === null) return -1;
      return eb - ea || a.account.localeCompare(b.account);
    });

  return [allRow, ...acctRows];
});

/** 点击行切换账户视角（组合会掩盖单账户爆仓，需能逐户下钻） */
const rowProps = (row: AccountRow) => ({
  style: 'cursor: pointer',
  onClick: () => emit('select', row.account)
});

/** 选中账户行淡蓝底高亮 */
const rowClassName = (row: AccountRow) => (row.account === props.account ? 'is-active' : '');

/**
 * 账户列：只显示名称（组合 / 账户），不贴任何越线标签。
 * 档位越线看 ② 档位压力表的「追保」列，风险高低看两组风险度着色 —— 信息不丢，账户列不加噪。
 */
function accountCell(row: AccountRow) {
  return h('span', { class: 'acct-name' }, row.account === 'ALL' ? '组合' : row.account);
}

/** 账户净值 / 权益列头口径：两者是一条恒等式的两个面，说明放一处防混读 */
const netHeader = metricHeader('账户净值', [
  '自有资金口径：账户价值 − 融资余额（acc_aset − diff_br），已按模型盯市修正。',
  '是真实风险度的分母；组合行 = 各账户之和。现价基准，不随滑块变。'
]);
const eqHeader = metricHeader('账户权益', [
  '客户权益 = 账户净值 + 账户融资（交易所口径，融资已含在内）。',
  '是交易所风险度的分母；组合行 = 各账户之和。现价基准，不随滑块变。'
]);
/**
 * 到档组列头口径（2026-11-13）：全部由 risk_scenario.run() 现算，前端不自算（🔒4.13）。
 * 一条恒等链：net_at = net0 − loss → eq_at = net_at + fin → R = margin_at / net_at、
 * E = margin_at / eq_at；覆盖率(R/E) 分别是两者的倒数。改价只动 net_at / margin_at，
 * fin 恒定 ⇒ eq_at 与 net_at 同步平移。
 * 净值 ≤ 0 时 R 分母非正：后端把 real 置 null，前端 R 半边显示「穿仓」标签；权益 ≤ 0 时 E 半边显示「-」。
 */
const atNetHeader = metricHeader('到档净值', [
  '= 当前盯市基线净值 − 该账户模型盯市亏损（net_at = net0 − loss），即假设价成立后的自有资金。',
  '基线 net0 = acc_aset − diff_br（🔒1.6），再补「模型盯市价 − 系统市值」差额；不含融资。',
  '是真实风险度的分母；≤ 0 即穿仓。0% 时与「现价基准」组账户净值逐值相等，改价后才分叉。'
]);
const atEqHeader = metricHeader('到档权益', [
  '= 到档净值 + 账户融资（diff_br），即券商 / 交易所口径的「客户权益」，融资已含在内；与现价组「账户权益」同口径不同时点，本页列名用「到档权益」区分。',
  '融资是静态账面值、不随假设价变 ⇒ 改价后「到档权益 − 到档净值」恒等于「账户融资」。',
  '是交易所风险度的分母；组合行 ALL = Σ各账户到档权益（后端 _combo 直接给），与「合计保证金 ÷ 组合交易所风险度」同源，不是前端推算。'
]);
const atMarginHeader = metricHeader('到档保证金', [
  '按假设价逐仓重算的占用合计：期货 = |到档市值|×率；期权义务仓按结算价与虚值额逐档重估（CFFEX/IO 15%、ETF 12%、au 15.81%）；证券与期权权利仓 = 0。',
  '保证金是下跌的反向变量：深跌时义务仓占用反而上升，禁止拿现价保证金乘系数估算。',
  '与「现价基准」组的「当前保证金」时点不同，两者不可相加对账。0% 时逐值相等。'
]);
const atMarginDeltaHeader = metricHeader('保证金变化', [
  '= 到档保证金 − 现价基准保证金（0% 情景），正 = 占用增加（红）、负 = 占用减少（绿）。',
  '只反映改价带来的占用变动，不含出入金 / 开平仓；与即期、到期时点无关。',
  '组合行 ALL = 合计到档保证金 − 0% 基准合计保证金（后端 _combo 给，= Σ各账户保证金变化）；0% 时恒为 0。'
]);
/**
 * 到档风险度合并列（2026-11-13）：真实 / 交易所两个口径并列一格，版式与现价组一致。
 * 原两列各自的口径说明合到这里，信息不丢。
 */
const atRiskHeader = metricHeader('到档风险度(R/E)', [
  'R（真实，左值）= 到档保证金 ÷ 到档净值（自有资金口径，分母不含融资）；E（交易所，右值）= 到档保证金 ÷ 到档权益（分母含融资，与券商 / 交易所口径一致）。',
  '预警看 R：≥ 1 表示自有资金不够覆盖保证金、缺口靠融资支撑；追保判定只认 E ≥ 1 或净值 ≤ 0。R ≥ 1 而 E < 1 时券商未必追保，须另行留意。',
  'R 侧为负或净值 ≤ 0（后端把 real 置 null）⇒ 穿仓，显示「穿仓」文字标签；此时 E 侧仍可能为正，两半边并列不互相顶替。',
  '净值为正时 R 是「覆盖率(R/E)」左值的倒数；权益 ≤ 0 时 E 半边显示「-」，组合净值转负时 R 同理显示穿仓，此时看「到档净值」「到档权益」。',
  '组合行：R = 合计保证金 ÷ 组合到档净值；E = 合计保证金 ÷ Σ各账户到档权益，不是各账户风险度的平均。'
]);

/** 预算行文案。缺口一律注明「压力口径」——那是跌 15% 之后的保证金，与即期缺口差好几倍 */
function budgetText(row: AccountRow): string {
  const card = row.budget;
  if (!card) {
    const s = props.board.budget.summary;
    if (s.verdict === 'skip') return '不判（无保证金持仓）';
    return s.headroom_total !== null && s.headroom_total < 0
      ? `合计缺口 ${fmtMoneyShort(-s.headroom_total)}（压力口径）`
      : '额度为正，但单账户均不足一手';
  }
  if (card.verdict === 'skip') return '不判（无保证金持仓）';
  if (card.lots > 0) return `可开 ${card.lots} 手（卡在 ${bindingLabel(card.binding, card)}）`;
  if (card.headroom !== null && card.headroom < 0) return `可开 0 手（压力口径缺口 ${fmtMoneyShort(-card.headroom)}）`;
  return `可开 0 手（额度 ${fmtMoneyShort(card.headroom)} 不足一手）`;
}

/** 预算行配色：block 红 / over 橙 / ok 绿 / 不判灰 */
function budgetColor(row: AccountRow): string {
  const v = row.budget ? row.budget.verdict : props.board.budget.summary.verdict;
  return levelColor(verdictLevel(v));
}

/**
 * 两级分组表头（四组）：账户(静态) / 现价基准 / 当前假设·到档 / 压力与预算。
 * 现价与到档两套净值、权益、保证金、风险度并列 —— 0% 时数值相等，改价后只有到档组变。
 * 分组父列不设 width，scroll-x 按叶子列宽和递归求和（🔒4.11）。
 */
const columns = computed<DataTableColumns<AccountRow>>(() => [
  {
    title: '账户(静态)',
    key: 'g_id',
    children: [
      { title: '账户', key: 'account', width: 60, render: (r: AccountRow) => accountCell(r) },
      {
        title: metricHeader('风险敞口', ACCOUNT_NOTES.exposure),
        key: 'risk_exposure',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.risk_exposure)
      },
      {
        title: '当前盈亏',
        key: 'pf_now',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => pnl(r.pf_now)
      }
    ]
  },
  {
    title: '现价基准（不随滑块变）',
    key: 'g_base',
    children: [
      { title: eqHeader, key: 'eq', width: 110, align: 'right' as const, render: (r: AccountRow) => fmtMoney(r.eq) },
      {
        title: netHeader,
        key: 'net',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.net)
      },
      {
        title: '当前保证金',
        key: 'margin',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.margin)
      },
      {
        title: metricHeader('当前风险度(R/E)', [
          'R（真实）= 当前保证金 ÷ 账户净值（自有资金口径，分母不含融资）；E（交易所）= 当前保证金 ÷ 账户权益（分母含融资，与券商 / 交易所口径一致）。',
          'R ≥ 1 表示自有资金不够覆盖保证金、缺口靠融资支撑；追保判定只认 E ≥ 1 或净值 ≤ 0。R ≥ 1 而 E < 1 时券商未必追保，须另行留意。',
          'R 侧为负或净值 ≤ 0（后端把 real 置 null）⇒ 穿仓，显示「穿仓」标签；E 侧仍给数值（权益含融资，分母可能仍为正）。',
          '现价基准，不随滑块变；与「到档风险度(R/E)」同口径不同时点。组合行 R = 合计保证金 ÷ 组合净值、E = 合计保证金 ÷ Σ各账户权益。'
        ]),
        key: 'real',
        width: 120,
        align: 'right' as const,
        render: (r: AccountRow) => ratioPair(r.real, r.exch, isBusted(r.real, r.net, r.margin))
      }
    ]
  },
  {
    title: metricHeader('当前假设 · 到档（随滑块变）', [
      '随左栏假设价每次重算；0% 基准时与「现价基准」组数值相等，改价后才分叉。',
      '恒等链：到档净值 = 基线净值 − 模型盯市亏损 → 到档权益 = 到档净值 + 账户融资 → 风险度(R) = 到档保证金 ÷ 净值、风险度(E) = 到档保证金 ÷ 权益；覆盖率(R/E) 分别是两者的倒数。',
      '净值 ≤ 0 即穿仓：风险度(R) 那半边显示「穿仓」标签，不显示负数或「-」；权益 ≤ 0 时风险度(E) 半边显示「-」。组合净值转负时同理。',
      '组合行 ALL 取 combo / baseline_combo：到档权益、覆盖率 R/E、保证金变化均由后端给，前端不自算（🔒4.13）。',
      'Δ 盈亏为模型盯市增量，与「当前盈亏」账面口径不同源，不可相加对账。'
    ]),
    key: 'g_at',
    children: [
      {
        title: deltaPnlHeader('即期', SIM_DELTA_SCOPE),
        key: 'delta_pnl_now',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => pnl(r.at.delta_pnl_now)
      },
      {
        title: deltaPnlHeader('到期', SIM_DELTA_SCOPE),
        key: 'delta_pnl_expiry',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => pnl(r.at.delta_pnl_expiry)
      },
      {
        title: atEqHeader,
        key: 'eq_at',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.at.eq_at)
      },
      {
        title: atNetHeader,
        key: 'net_at',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.at.net_at)
      },
      {
        title: atMarginHeader,
        key: 'margin_at',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => fmtMoney(r.at.margin_at)
      },
      {
        title: atMarginDeltaHeader,
        key: 'margin_delta',
        width: 110,
        align: 'right' as const,
        render: (r: AccountRow) => marginDelta(r.at.margin_delta)
      },
      {
        title: atRiskHeader,
        key: 'risk_at',
        width: 120,
        align: 'right' as const,
        render: (r: AccountRow) => ratioPair(r.at.real, r.at.exch, isBusted(r.at.real, r.at.net_at, r.at.margin_at))
      },
      {
        title: metricHeader('覆盖率(R/E)', ACCOUNT_NOTES.coverage),
        key: 'coverage',
        width: 120,
        align: 'right' as const,
        render: (r: AccountRow) => coveragePair(r.at.coverage, r.at.coverage_exch)
      }
    ]
  },
  {
    title: '压力与预算',
    key: 'g_budget',
    children: [
      {
        title: '可开额度',
        key: 'budget',
        width: 220,
        render: (r: AccountRow) => h('span', { style: { color: budgetColor(r) } }, budgetText(r))
      }
    ]
  }
]);

/** scroll-x = 叶子列宽和：分组表头父列不设 width，递归求和（🔒4.11） */
type WidthCol = { width?: number; children?: WidthCol[] };
function sumWidth(cols: WidthCol[]): number {
  return cols.reduce((s, c) => s + (c.children ? sumWidth(c.children) : Number(c.width ?? 0)), 0);
}
const scrollX = computed(() => sumWidth(columns.value as unknown as WidthCol[]));
</script>

<template>
  <!--
    2026-11-13 由「账户风险列表」+「分账户风险指标」合并为唯一账户总表：
    现价与到档两套并列、两级分组表头；点击行切换账户视角（联动压力表 / 逐仓总表 / KPI 卡）。
    不写 size（🔒4.7 全站口径）；账户数 <10 不分页、不需要虚拟滚动。
  -->
  <NDataTable
    :columns="columns"
    :data="rows"
    :pagination="false"
    :bordered="false"
    :row-key="(r: AccountRow) => r.account"
    :row-props="rowProps"
    :row-class-name="rowClassName"
    :scroll-x="scrollX"
  />
</template>

<style scoped>
/*
 * 单元格一律不折行：可开额度文案（可开 0 手（压力口径缺口 12.3 万））较长，
 * 折行会把行高撑成两倍。:deep() 是必须的——th/td 由 NDataTable 子组件渲染，
 * scoped 属性加不到它们身上，直接写类名无效且不报错。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}

/* 选中账户行：淡蓝底与卡片时代的描边等义 */
:deep(.n-data-table-tr.is-active .n-data-table-td) {
  background-color: rgba(32, 128, 240, 0.1);
}

.acct-name {
  font-weight: 600;
}
</style>
