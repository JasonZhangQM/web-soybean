<script setup lang="ts">
/**
 * 档位压力表（/risk 右栏第二块，2026-11-13 由 /irs/risk-board 情景压力表迁移改造）
 *
 * 与原压力表的根本差别：行不再是「全组同跌 X%」11 档，而是**全部监测标的同步到
 * 同一档**的五个档位（极低/低/中/高/极高）+ 一行现价基准。每个标的用自己的 pp_*
 * 档位价，故各标的到档幅度不同 —— 「到档幅度区间」列给的是区间，不是单一涨跌幅。
 *
 * 2026-11-13 第二次调整（用户口径）：本表只留「到档」读数，与 ① 账户总表的
 * 现价基准组不再重复 —— 删掉账户当前盈亏 / 组合盈亏 / 账户净值 / 保证金 /
 * 真实风险度 / 交易所风险度六列，换成即期Δ、到期Δ、到档权益、到档净值、
 * 到档保证金、保证金变化、到档风险度(R/E)、覆盖率(R/E)。口径、列序、渲染函数
 * 与 ① 账户总表逐列对齐（共用 utils 里的 ratioPair / coveragePair / marginDelta）。
 *
 * 点击整行 = 选中档位；由父页同步批量套用左栏滑块（所见即所得），逐张合约 /
 * 保证金结构图的 Δ 盈亏随之联动。组合与账户指标全部后端现算，前端只切视角、
 * 不做任何自算（🔒4.13）—— 双时点 Δ 盈亏也由后端 combo 给（build_levels 的
 * delta_pnl_now / delta_pnl_expiry）。
 *
 * NDataTable 不写 size（🔒4.7）；scroll-x 由列宽和求出（🔒4.11）；
 * th/td 不折行必须写 :deep()（scoped 属性加不到子组件渲染的单元格上）。
 */
import { computed, h } from 'vue';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  coveragePair,
  deltaPnlHeader,
  fmtMoney,
  isBusted,
  marginDelta,
  metricHeader,
  pnl,
  ratioPair
} from '@/views/irs/risk-board/modules/utils';

defineOptions({ name: 'LevelPressureTable' });

const props = defineProps<{
  /** 五档档位压力结果（POST /irs/simulate/levels）—— 本表所有数字的唯一来源 */
  levels: Api.Irs.SimulateLevelsResult;
  /** 当前账户视角：ALL = 组合 */
  account: string;
  /** 当前选中档位：'base' = 现价基准，其余为 el/l/m/h/eh */
  activeLevel: string;
}>();

const emit = defineEmits<{ select: [key: string] }>();

interface Row {
  key: string;
  label: string;
  /** 该档实际生效标的数；现价基准行为 null */
  subjectCount: number | null;
  pctMin: number | null;
  pctMax: number | null;
  /** 即期 / 到期 Δ 盈亏（正=盈），与 ① 账户总表同口径、同后端字段 */
  deltaNow: number;
  deltaExpiry: number;
  /** 到档权益（交易所口径分母）/ 到档净值（真实口径分母） */
  eqAt: number;
  netAt: number;
  marginAt: number;
  /** 相对 0% 基准的保证金变化；null = 后端无基准（本页恒定有基准） */
  marginDelta: number | null;
  real: number | null;
  exch: number | null;
  coverage: number | null;
  coverageExch: number | null;
  breached: boolean;
}

interface Src {
  combo: Api.Irs.SimulateCombo;
  accounts: Api.Irs.SimulateAccount[];
  /** 组合层双时点 Δ 盈亏（正=盈）；单账户视角改用该账户自己的两列 */
  deltaNow: number;
  deltaExpiry: number;
}

/**
 * 按账户视角取该档的读数。
 * - ALL：组合层 combo（Σ÷Σ，不是各账户比率平均），追保 = 任一账户越线；
 * - 单账户：取该账户卡；账户不存在（空账户未展示）时给 0/null，不伪造数。
 */
function makeRow(
  key: string,
  label: string,
  src: Src,
  ext: { subjectCount: number | null; pctMin: number | null; pctMax: number | null }
): Row {
  if (props.account === 'ALL') {
    return {
      key,
      label,
      ...ext,
      deltaNow: src.deltaNow,
      deltaExpiry: src.deltaExpiry,
      eqAt: src.combo.eq_at,
      netAt: src.combo.net_at,
      marginAt: src.combo.margin_total,
      marginDelta: src.combo.margin_delta,
      real: src.combo.real,
      exch: src.combo.exch,
      coverage: src.combo.coverage,
      coverageExch: src.combo.coverage_exch,
      breached: src.accounts.some(a => a.breached)
    };
  }
  const a = src.accounts.find(x => x.account === props.account);
  return {
    key,
    label,
    ...ext,
    deltaNow: a?.delta_pnl_now ?? 0,
    deltaExpiry: a?.delta_pnl_expiry ?? 0,
    eqAt: a?.eq_at ?? 0,
    netAt: a?.net_at ?? 0,
    marginAt: a?.margin_at ?? 0,
    marginDelta: a?.margin_delta ?? null,
    real: a?.real ?? null,
    exch: a?.exch ?? null,
    coverage: a?.coverage ?? null,
    coverageExch: a?.coverage_exch ?? null,
    breached: a?.breached ?? false
  };
}

/** 现价基准行在最前，其后按后端 level_order（到档价升序）= 极低 → 极高 */
const rows = computed<Row[]>(() => {
  const bl = props.levels.baseline;
  const out: Row[] = [
    makeRow(
      'base',
      '现价',
      {
        combo: bl.combo,
        accounts: bl.accounts,
        deltaNow: bl.delta_pnl_now,
        deltaExpiry: bl.delta_pnl_expiry
      },
      { subjectCount: null, pctMin: null, pctMax: null }
    )
  ];
  for (const key of props.levels.level_order) {
    const lv = props.levels.levels[key];
    if (!lv) continue;
    out.push(
      makeRow(
        key,
        lv.label,
        {
          combo: lv.combo,
          accounts: lv.accounts,
          deltaNow: lv.delta_pnl_now,
          deltaExpiry: lv.delta_pnl_expiry
        },
        { subjectCount: lv.subject_count, pctMin: lv.pct_min, pctMax: lv.pct_max }
      )
    );
  }
  return out;
});

/** 首个触发追保的档位（不含现价基准行），整行浅红 */
const breachKey = computed(() => rows.value.find(r => r.key !== 'base' && r.breached)?.key ?? '');

function fmtPct(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v) * 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function pctCell(r: Row) {
  if (r.pctMin === null || r.pctMax === null) return h('span', { class: 'text-gray-400' }, '—');
  if (Math.abs(r.pctMax - r.pctMin) < 1e-6) return fmtPct(r.pctMin);
  return `${fmtPct(r.pctMin)} ~ ${fmtPct(r.pctMax)}`;
}

/** 档位列：档位名 + 实际参与标的数（无该档位的标的保持现价，不能默认全参与） */
function labelCell(r: Row) {
  return h('span', { class: 'lvl-cell' }, [
    h('span', { class: 'lvl-name' }, r.label),
    r.subjectCount === null
      ? h(NTag, { size: 'tiny', bordered: false, round: true }, { default: () => '0% 基准' })
      : h(NTag, { size: 'tiny', bordered: false, type: 'info' }, { default: () => `${r.subjectCount} 标的` })
  ]);
}

/** Δ 盈亏列的统计范围：本表按账户全部持仓（与 ① 账户总表逐字一致） */
const DELTA_SCOPE =
  '两列都是相对当前的 Δ（V(S1)−V(S0)），按账户全部持仓统计；组合行 = 各账户之和。即期：改价未命中的持仓价格冻结、Δ 恒 0；到期：所有期权（含冻结行）时间价值归零，Δ 也含这部分 ⇒ 只有 Σ即期Δ 可与组合 Δ盈亏对账。证券/期货两列恒等，差异只来自期权。⚠️ 现价行到期列不是 0：全组合时间价值衰减即该列数值。';

const atEqHeader = metricHeader('到档权益', [
  '= 到档净值 + 账户融资（diff_br），即券商 / 交易所口径的「客户权益」，融资已含在内；是交易所风险度(E)的分母。',
  '融资是静态账面值、不随假设价变 ⇒ 改价后「到档权益 − 到档净值」恒等于账户融资。',
  '现价行 = 0% 基准的客户权益；组合行 = Σ各账户到档权益（后端 _combo 直接给，不是前端推算）。'
]);
const atNetHeader = metricHeader('到档净值', [
  '= 基线净值 − 模型盯市亏损（net_at = net0 − loss），即假设价成立后的自有资金；不含融资，是真实风险度(R)的分母。',
  '≤ 0 即穿仓：风险度(R) 那半边显示「穿仓」标签。现价行与 ① 账户总表现价组的账户净值逐值相等。',
  '组合行 = 各账户之和（后端现算）。'
]);
const atMarginHeader = metricHeader('到档保证金', [
  '按该档假设价逐仓重算的占用合计：期货 = |到档市值|×率；期权义务仓按结算价与虚值额逐档重估（CFFEX/IO 15%、ETF 12%、au 15.81%）；证券与期权权利仓 = 0。',
  '保证金是下跌的反向变量：深跌时义务仓占用反而上升，禁止拿现价保证金乘系数估算。',
  '现价行 = 0% 基准保证金；与时点（即期/到期）无关，只吃标的价格。'
]);
const atMarginDeltaHeader = metricHeader('保证金变化', [
  '= 该档到档保证金 − 现价基准保证金（0% 情景），正 = 占用增加（红）、负 = 占用减少（绿）。',
  '只反映到档价带来的占用变动，不含出入金 / 开平仓；与即期、到期时点无关。',
  '组合行 = 合计到档保证金 − 0% 基准合计保证金（后端 _combo 给，= Σ各账户保证金变化）；现价行恒为 0。'
]);
const atRiskHeader = metricHeader('到档风险度(R/E)', [
  'R（真实，左值）= 到档保证金 ÷ 到档净值（自有资金口径，分母不含融资）；E（交易所，右值）= 到档保证金 ÷ 到档权益（分母含融资，与券商 / 交易所口径一致）。',
  '预警看 R：≥ 1 表示自有资金不够覆盖保证金、缺口靠融资支撑；追保判定只认 E ≥ 1 或净值 ≤ 0。R ≥ 1 而 E < 1 时券商未必追保，须另行留意。',
  'R 侧为负或净值 ≤ 0（后端把 real 置 null）⇒ 穿仓，显示「穿仓」文字标签；此时 E 侧仍可能为正，两半边并列不互相顶替。',
  '与 ① 账户总表「到档风险度(R/E)」同口径；组合行 R = 合计保证金 ÷ 组合到档净值，E = 合计保证金 ÷ Σ各账户到档权益。'
]);
const coverageHeader = metricHeader('覆盖率(R/E)', [
  'R（真实）= 到档净值 ÷ 到档保证金，即自有资金对保证金占用的覆盖倍数；净值为正时恰好是「到档风险度(R)」的倒数。',
  'E（交易所）= 到档权益 ÷ 到档保证金（分母含融资）；恰好是「到档风险度(E)」的倒数。融资为正时 E > R，差额就是融资撑出来的覆盖倍数。',
  'R ≥ 1 表示自有资金够覆盖占用，<1 表示保证金已超过自有资金；保证金为 0 时两值都显示「-」，净值 ≤0 时 R 显示 0 或负数（此时看风险度列的「穿仓」标签）。',
  '组合行 R = 组合到档净值 ÷ 合计保证金、E = Σ各账户到档权益 ÷ 合计保证金，与逐账户同式，不是各账户覆盖率的平均。'
]);

const columns = computed<DataTableColumns<Row>>(() => [
  { title: '档位', key: 'label', width: 100, render: labelCell },
  {
    title: '到档幅度区间',
    key: 'pct',
    width: 160,
    align: 'right' as const,
    render: pctCell
  },
  {
    title: deltaPnlHeader('即期', DELTA_SCOPE),
    key: 'delta_now',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => pnl(r.deltaNow)
  },
  {
    title: deltaPnlHeader('到期', DELTA_SCOPE),
    key: 'delta_expiry',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => pnl(r.deltaExpiry)
  },
  {
    title: atEqHeader,
    key: 'eq_at',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => fmtMoney(r.eqAt)
  },
  {
    title: atNetHeader,
    key: 'net_at',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => fmtMoney(r.netAt)
  },
  {
    title: atMarginHeader,
    key: 'margin_at',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => fmtMoney(r.marginAt)
  },
  {
    title: atMarginDeltaHeader,
    key: 'margin_delta',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => marginDelta(r.marginDelta)
  },
  {
    title: atRiskHeader,
    key: 'risk_at',
    width: 130,
    align: 'right' as const,
    render: (r: Row) => ratioPair(r.real, r.exch, isBusted(r.real, r.netAt, r.marginAt))
  },
  {
    title: coverageHeader,
    key: 'coverage',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => coveragePair(r.coverage, r.coverageExch)
  },
  {
    title: '追保',
    key: 'breached',
    width: 90,
    render: (r: Row) =>
      r.breached
        ? h(NTag, { type: 'error', size: 'small' }, { default: () => '越线' })
        : h('span', { class: 'text-gray-400' }, '—')
  }
]);

/** scroll-x = 列宽和：加列/改列宽无需手改常量（🔒4.11） */
const scrollX = computed(() => columns.value.reduce((s, c) => s + Number(c.width ?? 0), 0));

function rowProps(row: Row) {
  const parts: string[] = ['cursor: pointer'];
  if (row.key === 'base') parts.push('background: rgba(24, 160, 88, 0.08)');
  if (row.key === breachKey.value) parts.push('background: rgba(208, 48, 80, 0.08)');
  if (row.key === props.activeLevel) parts.push('box-shadow: inset 3px 0 0 #2080f0');
  return { style: parts.join('; '), onClick: () => emit('select', row.key) };
}
</script>

<template>
  <!-- 单根元素：与 ① 账户总表 / ③ 逐仓总表一致，父页传的 class（mb-16px）正常生效 -->
  <div>
    <!--
      口径提示不塞进卡片：父页用 SectionBar 分节，这里只保留一行说明。
      五档幅度各标的不同，「到档幅度区间」是区间不是单一涨跌幅；「极高」为上涨侧压力。
      顶栏批量按钮下线后，本表是全页唯一档位入口，故一并写明跳过规则与「现价」行语义。
    -->
    <!--
 <div class="mb-6px text-11px text-gray-400">
      全部标的同步到同一档、各用自身 pp_*；无该档位的标的保持现价（档位列标注实际参与标的数）， 幅度为各标的的区间
      [推算]。「极高」是上涨方向，档位名不代表风险排序； 点击整行切换档位，点「现价」行 = 全部回现价。
    </div> 
-->
    <NDataTable
      :columns="columns"
      :data="rows"
      :row-props="rowProps"
      :pagination="false"
      :bordered="false"
      :row-key="(r: Row) => r.key"
      :scroll-x="scrollX"
    />
  </div>
</template>

<style scoped>
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}

.lvl-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lvl-name {
  font-weight: 600;
}
</style>
