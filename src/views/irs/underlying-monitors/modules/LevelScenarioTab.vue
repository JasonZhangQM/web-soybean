<script setup lang="ts">
/**
 * 到档情景面板（2026-11-09 起并入「档位」Tab，不再是独立 Tab；2026-11-10 起取消折叠、直接展示）：
 * 五档并列、假设到价，展示该标的项下持仓的盈亏 / 保证金 / 风险指标。
 * 随「档位」Tab 常驻挂载、onMounted 即取数；`defineExpose({ load })` 供保存 / 删除档位后重算。
 *
 * 口径全部由后端 `GET /underlying-monitors/{id}/level-scenario` 给出，本组件不自算任何
 * 保证金、净值或风险度（铁律 4.13：前端禁自算）。红亏绿盈与风险度配色复用风险看板 utils。
 *
 * 三类表格统一走 UnderlyingDataTable：它自动按列宽求和喂 scroll-x、自带 :deep() 禁折行，
 * 且 NDataTable 不写 size（铁律 4.7 / 4.11）。
 *
 * 2026-11-12 起取消「即期 / 到期」切换：主时点固定即期，两列 Δ 盈亏并列且列名固定。
 */
import { computed, h, onMounted, ref, watch } from 'vue';
import type { HTMLAttributes } from 'vue';
import { NAlert, NButton, NSpin, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  fetchUnderlyingLevelScenario,
  type LevelScenario,
  type LevelScenarioAccount,
  type LevelScenarioLevel,
  type LevelScenarioPosition
} from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import SectionBar from './SectionBar.vue';
import {
  deltaPnlHeader,
  fmtMoney,
  fmtPrice,
  fmtRatio,
  levelColor,
  metricHeader,
  ratioLevel
} from '@/views/irs/risk-board/modules/utils';

defineOptions({ name: 'UnderlyingLevelScenarioTab' });

const props = defineProps<{ umId: number; symbol: string }>();

const data = ref<LevelScenario | null>(null);
const loading = ref(false);
const err = ref('');
const activeLevel = ref('m');

/**
 * 五档表按档位倒序展示：后端 level_order 恒为到档价升序（极低 → 低 → 中 → 高 → 极高），
 * 表格倒过来即「极高 → 高 → 中 → 低 → 极低」。只改行的展示顺序，
 * levels / horizon_compare 仍按 key 索引，后端契约零改动；默认选中档仍是中档 m。
 */
function displayOrder(order: string[]): string[] {
  return [...order].reverse();
}

async function load() {
  loading.value = true;
  err.value = '';
  // 固定即期：后端一次请求已含两套时点，无需切换重算（详见下方时点口径说明）
  const { data: d, error } = await fetchUnderlyingLevelScenario(props.umId, 'now');
  if (error || !d) {
    const detail = (error as any)?.response?.data?.detail;
    err.value = typeof detail === 'string' ? detail : '到档情景计算失败，请稍后重试。';
    data.value = null;
  } else {
    data.value = d;
    if (!d.levels[activeLevel.value]) activeLevel.value = displayOrder(d.level_order)[0] ?? '';
  }
  loading.value = false;
}

onMounted(load);
/** 供档位 Tab 在保存 / 删除档位后重算（组件常驻挂载，可直接调用） */
defineExpose({ load });
/** 换标的时清空重算：umId 是主键，symbol 一并监听可防 id 漂移（抽屉注释里那条历史坑） */
watch(
  () => [props.umId, props.symbol] as const,
  () => {
    data.value = null;
    load();
  }
);

/**
 * 时点口径固定（2026-11-12 取消「即期 / 到期」切换按钮）：
 * 后端每档同时跑两个时点，一次请求返回 levels（主时点完整明细）+ horizon_compare（另一时点汇总），
 * 两列 Δ 盈亏恒定并列；原按钮只是把两列角色对调，数值集合完全不变。
 * 主时点固定即期：该口径下价格冻结的其它持仓 loss=0，五档 / 逐仓 / 分账户三表 Δ 可对齐；
 * 若以到期作主时点，其它期权「时间价值归零」会混进全组合 loss，污染净值 / 风险度 / 覆盖率。
 * 列名只写时点（即期 / 到期），统计范围由下方说明承载。
 */
const mainLabel = '即期';
const otherLabel = '到期';
const current = computed<LevelScenarioLevel | null>(() => data.value?.levels[activeLevel.value] ?? null);

/** 盈亏染色：沿用风险看板口径，亏红盈绿 */
function pnl(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { style: { color: n < 0 ? '#d03050' : '#18a058' } }, fmtMoney(n));
}

/** 保证金变化：占用增加染红、减少染绿，显示带符号的原值（不取相反数） */
function marginDelta(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { style: { color: n > 0 ? '#d03050' : '#18a058' } }, `${n > 0 ? '+' : ''}${fmtMoney(n)}`);
}

/** 风险度：4 位小数 + 分档配色 */
function ratio(v: number | null | undefined) {
  return h('span', { style: { color: levelColor(ratioLevel(v)) } }, fmtRatio(v));
}

function pct(v: number | null | undefined) {
  const n = Number(v ?? 0) * 100;
  return h('span', { style: { color: n < 0 ? '#18a058' : '#d03050' } }, `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
}

interface LevelRow {
  key: string;
  label: string;
  pp: number;
  pct: number;
  pf_now: number;
  delta_pnl: number;
  other_delta_pnl: number | null;
  margin_at: number;
  margin_delta: number;
  combo_margin: number;
  combo_net: number;
  /** 标的项下持仓风险敞口合计：取 levels.*.total.risk_exposure，与列表页「风险敞口」同源 */
  subject_exposure: number | null;
  real: number | null;
  exch: number | null;
}

const levelRows = computed<LevelRow[]>(() => {
  const d = data.value;
  if (!d) return [];
  return displayOrder(d.level_order).map(key => {
    const lv = d.levels[key];
    const cmp = d.horizon_compare[key];
    return {
      key,
      label: lv.label,
      pp: lv.pp,
      pct: lv.pct,
      pf_now: lv.total.pf_now,
      delta_pnl: lv.total.delta_pnl,
      other_delta_pnl: cmp?.delta_pnl ?? null,
      margin_at: lv.total.margin_at,
      margin_delta: lv.total.margin_delta,
      combo_margin: lv.combo.margin_total,
      combo_net: lv.combo.net_at,
      subject_exposure: lv.total.risk_exposure,
      real: lv.combo.real,
      exch: lv.combo.exch
    };
  });
});

/**
 * 整行点击联动：与 `/irs/risk-board` 情景压力表同一套交互（cursor:pointer +
 * 选中行蓝色左边条），不再靠档位列的文字按钮触发。选中态只认 activeLevel。
 */
function levelRowProps(row: LevelRow): HTMLAttributes {
  const parts = ['cursor: pointer'];
  if (row.key === activeLevel.value) parts.push('box-shadow: inset 3px 0 0 #2080f0');
  return {
    style: parts.join('; '),
    onClick: () => {
      activeLevel.value = row.key;
    }
  };
}

/**
 * 五档表各列的口径说明，与后端 `um_level_scenario._combo` / `assemble().total` /
 * `risk_scenario.run` 对齐。⚠️「标的风险敞口」是标的口径（total.risk_exposure），
 * 同表其余组合指标才是全账户口径；分账户表同名列又是单账户口径，三者文案不可复用。
 */
const METRIC_NOTES = {
  exposure: [
    '标的风险敞口 = 该标的项下持仓的风险敞口合计：bills_group_symbol 按归属标的（显式 underlying_symbol 优先、否则代码本身）汇总 SUM(risk_exposure)，只计可归属的在仓交易行。',
    '与列表页「风险敞口」列、本抽屉顶部「敞口」、下方「X 档持仓明细」逐仓敞口之和、回撤率分母同源，逐值一致。',
    '人工确认的静态值，不随行情、档位或时点变化，五档恒定；NULL = 未设置，显示「-」，不伪造 0。',
    '与同表「组合保证金 / 组合净值 / 风险度」的全账户口径、分账户表「风险敞口」的账户口径都不同，不可相加对账；与模型 Δ 盈亏也基准不同。'
  ],
  margin: [
    '该档位情景下所有账户的保证金占用合计：全账户口径，含本情景中价格冻结的其它持仓。',
    '逐仓按到档价重算（期货 |市值|×保证金率、卖方期权按三品种公式、买方期权与证券为 0），不能拿当前值乘系数；下跌时义务仓保证金反而上升。',
    '是占用金额，不是需要补缴的钱。'
  ],
  net: [
    '到档后全账户自有资金 = 当前系统净值（acc_aset − diff_br，补期权模型盯市差额）− 该情景模型亏损。',
    '穿仓只看净值 ≤ 0。这是模型推演值，不是账单账面浮盈；与「当前盈亏」「Δ盈亏」基准不同，不可相加对账。'
  ],
  real: [
    '= 组合保证金 ÷ 组合净值，分母是已扣融资余额的自有资金。',
    '用于预警：≥1 表示保证金占用已超过自有净资产。',
    '交易所口径的分母含融资，数值通常更低；真实 ≥1 而交易所 <1 时须单独留意。'
  ],
  exch: [
    '= 组合保证金 ÷ Σ客户权益；客户权益 = 情景净值 + 融资余额 diff_br。',
    '交易所/期货公司口径，也是唯一判追保的口径（≥1 或净值 ≤0）。',
    '组合层是 Σ÷Σ，不是各账户比率的平均。'
  ]
};

const levelColumns = computed<DataTableColumns<LevelRow>>(() => [
  {
    title: '档位',
    key: 'label',
    width: 100,
    render: (r: LevelRow) => h('span', { style: 'font-weight: 600' }, `${r.label} ${fmtPrice(r.pp)}`)
  },
  { title: '到档涨跌', key: 'pct', width: 100, align: 'right' as const, render: (r: LevelRow) => pct(r.pct) },
  {
    title: metricHeader('标的风险敞口', METRIC_NOTES.exposure),
    key: 'subject_exposure',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.subject_exposure)
  },
  {
    title: '当前盈亏',
    key: 'pf_now',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => pnl(r.pf_now)
  },
  {
    title: deltaPnlHeader(mainLabel),
    key: 'delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => pnl(r.delta_pnl)
  },
  {
    title: deltaPnlHeader(otherLabel),
    key: 'other_delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => pnl(r.other_delta_pnl)
  },
  {
    title: '标的保证金',
    key: 'margin_at',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.margin_at)
  },
  {
    title: '保证金变化',
    key: 'margin_delta',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => marginDelta(r.margin_delta)
  },
  {
    title: metricHeader('组合保证金', METRIC_NOTES.margin),
    key: 'combo_margin',
    width: 100,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.combo_margin)
  },
  {
    title: metricHeader('组合净值', METRIC_NOTES.net),
    key: 'combo_net',
    width: 100,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.combo_net)
  },
  {
    title: metricHeader('真实风险度', METRIC_NOTES.real),
    key: 'real',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => ratio(r.real)
  },
  {
    title: metricHeader('交易所风险度', METRIC_NOTES.exch),
    key: 'exch',
    width: 110,
    align: 'right' as const,
    render: (r: LevelRow) => ratio(r.exch)
  }
]);

function kindLabel(p: LevelScenarioPosition) {
  if (p.kind === 'fut') return '期货';
  if (p.kind === 'stock') return '证券';
  if (p.kind === 'put') return '期权·沽';
  if (p.kind === 'call') return '期权·购';
  return p.kind;
}

const positionColumns = computed<DataTableColumns<LevelScenarioPosition>>(() => [
  { title: '账户', key: 'account', width: 40 },
  { title: '合约', key: 'symbol', width: 190 },
  { title: '类别', key: 'kind', width: 70, render: (p: LevelScenarioPosition) => kindLabel(p) },
  {
    title: '数量',
    key: 'qty',
    width: 60,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => String(p.qty ?? '-')
  },
  {
    title: '行权价',
    key: 'strike',
    width: 90,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => (p.strike != null ? fmtPrice(p.strike) : '-')
  },
  {
    title: '风险敞口',
    key: 'risk_exposure',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => fmtMoney(p.risk_exposure)
  },
  {
    title: '基准价→到档价',
    key: 'price_now',
    width: 160,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => `${fmtPrice(p.price_now)}→${fmtPrice(p.price_at)}`
  },
  {
    title: '当前盈亏',
    key: 'pf_now',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => pnl(p.pf_now)
  },
  {
    title: deltaPnlHeader(mainLabel),
    key: 'delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => pnl(p.delta_pnl)
  },
  {
    title: deltaPnlHeader(otherLabel),
    key: 'other_delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => pnl(p.other_delta_pnl)
  },
  {
    title: '到档保证金',
    key: 'margin_at',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => fmtMoney(p.margin_at)
  },
  {
    title: '保证金变化',
    key: 'margin_delta',
    width: 110,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => marginDelta(p.margin_delta)
  }
]);

/**
 * 分账户表三列的口径说明：风险敞口取账户汇总表静态值，覆盖率 / 追保的分子分母都只取本账户，
 * 与五档表「标的风险敞口」（标的口径）及组合层 Σ÷Σ 都不同，故不复用 METRIC_NOTES；
 * 文案与后端 `_exposure_by_account` / `_account_rows` / `run()` 的口径对齐。
 */
const ACCOUNT_NOTES = {
  exposure: [
    '账户层面风险敞口 = bills_group_acc.risk_exposure，即账户内各 Group 敞口之和，含该账户全部持仓；与该标的项下口径无关。',
    '静态账面值，不随档位或时点变化，五档恒定；NULL（全部未设置）显示「-」，不按 0 计。',
    '与五档表「标的风险敞口」、「X 档持仓明细」逐仓敞口、顶部「敞口」（三者均为标的项下口径）不同，不可相加或对账。'
  ],
  coverage: [
    '= 该账户到档净值 ÷ 该账户保证金，即自有资金对保证金占用的覆盖倍数。',
    '净值为正时恰好是「真实风险度」的倒数：≥1 表示自有资金够覆盖占用，<1 表示保证金已超过自有资金。',
    '保证金为 0 时显示「-」；净值 ≤0 时会显示 0 或负数。只用本账户数据，不是组合口径。'
  ],
  breached: [
    '模型推演的越线标记，不是券商 / 交易所实际发出的追保通知。',
    '判据：该账户到档净值 ≤ 0，或交易所风险度（保证金 ÷ 客户权益）≥ 1；空账户（无净值无保证金）豁免。',
    '只判交易所口径，不看真实风险度：真实 ≥1 而交易所 <1 时这里仍显示「—」，须另行留意。'
  ]
};

const accountColumns = computed<DataTableColumns<LevelScenarioAccount>>(() => [
  { title: '账户', key: 'account', width: 40 },
  {
    title: metricHeader('风险敞口', ACCOUNT_NOTES.exposure),
    key: 'risk_exposure',
    width: 120,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.risk_exposure)
  },
  {
    title: '账户当前盈亏',
    key: 'pf_now',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => pnl(a.pf_now)
  },
  {
    title: deltaPnlHeader(mainLabel),
    key: 'delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => pnl(a.delta_pnl)
  },
  {
    title: deltaPnlHeader(otherLabel),
    key: 'other_delta_pnl',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => pnl(a.other_delta_pnl)
  },
  {
    title: '到档净值',
    key: 'net_at',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.net_at)
  },
  {
    title: '客户权益',
    key: 'eq_at',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.eq_at)
  },
  {
    title: '保证金',
    key: 'margin_at',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.margin_at)
  },
  {
    title: '真实风险度',
    key: 'real',
    width: 100,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => ratio(a.real)
  },
  {
    title: '交易所风险度',
    key: 'exch',
    width: 100,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => ratio(a.exch)
  },
  {
    title: metricHeader('覆盖率', ACCOUNT_NOTES.coverage),
    key: 'coverage',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtRatio(a.coverage)
  },
  {
    title: metricHeader('追保(模型)', ACCOUNT_NOTES.breached),
    key: 'breached',
    width: 130,
    render: (a: LevelScenarioAccount) =>
      a.breached ? h(NTag, { type: 'error', size: 'small' }, { default: () => '越线' }) : '—'
  }
]);
</script>

<template>
  <div class="level-scenario">
    <!--
 <SectionBar title="到档情景">
      <NTag size="small" :bordered="false" type="info">五档并列 · 假设到价</NTag>
      <NTag size="small" :bordered="false" type="warning">保证金 [推算]</NTag>
      <template #actions>
        <NButton size="tiny" :loading="loading" @click="load">刷新</NButton>
      </template>
    </SectionBar>

    <NAlert type="warning" :bordered="false" class="mb-12px">
      全部数值为 [推算]：持仓按同百分比平移（beta=1），义务仓保证金按交易所公式逐档重算，
      未读日结单「持仓汇总」实读值；追保标记为模型口径，不构成追保结论。
    </NAlert> 
-->

    <NSpin :show="loading">
      <NAlert v-if="err" :bordered="false" class="mb-12px">
        {{ err }}
        <div class="mt-8px text-12px">
          常见原因：期权行情陈旧、合约未认领、行情日混用。请到批量同步页同步期权行情后重试。
        </div>
        <NButton size="tiny" class="mt-8px" @click="load">重试</NButton>
      </NAlert>

      <template v-if="data">
        <NAlert v-if="!data.mapping.matched_positions" type="info" :bordered="false" class="mb-12px">
          该标的当前无在仓持仓，仅展示档位价；盈亏与保证金为空。
        </NAlert>

        <SectionBar title="五档 × 组合风险指标">
          <span class="text-12px text-gray-400">
            点击整行切换下方明细；「当前盈亏」为账面浮动盈亏、五档恒定；「即期Δ盈亏 / 到期Δ盈亏」双时点并列、列名固定
          </span>
        </SectionBar>
        <UnderlyingDataTable
          :columns="levelColumns"
          :data="levelRows"
          :page-size="0"
          :row-props="levelRowProps"
          class="mb-16px"
        />
        <div class="mb-16px text-12px text-gray-400">
          「标的风险敞口」为该标的项下持仓口径；组合保证金 / 净值 /
          风险度为账户全部持仓口径，含本情景中价格冻结的其它持仓。 追保只判交易所口径；真实口径 ≥1 而交易所口径 &lt;1
          时须单独留意。「当前盈亏」是账面口径（五档表 / 逐仓为该标的项下，分账户表为账户全部持仓）， 两列 Δ
          盈亏是模型盯市口径、且只统计该标的项下持仓，两者基准不同，不可相加对账。
        </div>

        <template v-if="current">
          <SectionBar :title="current.label + '档持仓明细'">
            <NTag size="small" :bordered="false">档位价{{ fmtPrice(current.pp) }}</NTag>
            <NTag size="small" :bordered="false" :type="current.total.delta_pnl < 0 ? 'error' : 'success'">
              即期Δ盈亏 {{ fmtMoney(current.total.delta_pnl) }}
            </NTag>
            <NTag size="small" :bordered="false" type="warning">
              到档浮盈 {{ fmtMoney(current.total.pf_at_level) }} [推算]
            </NTag>
            <span class="text-12px text-gray-400">
              敞口 {{ fmtMoney(current.total.risk_exposure) }}·回撤率
              {{ current.total.drawdown_ratio == null ? '-' : `${(current.total.drawdown_ratio * 100).toFixed(2)}%` }}
            </span>
          </SectionBar>
          <UnderlyingDataTable :columns="positionColumns" :data="current.positions" :page-size="0" class="mb-16px" />

          <SectionBar :title="current.label + '档·分账户风险指标'">
            <span class="text-12px text-gray-400">
              「账户当前盈亏」为账户层面全部持仓账面浮盈，与该标的项下口径无关；两个Δ盈亏仍只统计该标的项下持仓
            </span>
          </SectionBar>
          <UnderlyingDataTable :columns="accountColumns" :data="current.accounts" :page-size="0" class="mb-16px" />
        </template>

        <!-- <div class="mb-8px font-500">口径与告警</div> -->
        <!--
 <NAlert v-for="(w, i) in data.warnings" :key="i" type="default" :bordered="false" class="mb-4px">
          {{ w }}
        </NAlert> 
-->
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
/*
 * 到档情景三张表压行高：全局主题已把 medium 的 th/td padding 压到 4px 8px
 * （theme/shared.ts 的 DataTable 覆盖），这里再收到 2px 8px，每行少 4px。
 * 只挂在本组件根元素上 ⇒ 抽屉内其它 Tab、列表页、风险看板均不受影响。
 * 必须用 :deep()：NDataTable 的 th/td 由子组件渲染，scoped 属性加不到它们身上（铁律 4.11）。
 * 🔒4.7：不写 size="small" —— 全局只压了 medium，small 仍是原生 8px，反而会把行撑高。
 */
.level-scenario :deep(.n-data-table-th),
.level-scenario :deep(.n-data-table-td) {
  padding-top: 2px;
  padding-bottom: 2px;
}
</style>
