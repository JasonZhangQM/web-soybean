<script setup lang="ts">
/**
 * 组合快照（/risk 右栏最顶部，2026-11-15 由 RiskKpiCards 改造）
 *
 * 原来是一排 6 张 KPI 卡、挂在 ④ 推演区的 `v-else-if="result"` 分支里 —— 位置靠后、
 * 推演没算完就不显示。现按用户要求改成**一张紧凑表格**，固定放在 ① 账户总表之前，
 * 只依赖 GET /irs/risk-board 的静态看板数据（+ 档位口径首个追保），推演结果未到也常驻。
 *
 * 表格形态：6 个指标各占一列，表头 = 指标名，单行数据 = 主值 + 一行小字口径说明
 * （过长省略、hover 看全文）。原来 6 张卡的所有读数与配色逐项保留，口径不重算、不自造。
 * ALL = 组合口径，点击账户总表行切到单账户时改用该账户卡（与旧 KPI 卡同一联动）。
 *
 * 不写 size（🔒4.7）；scroll-x 按列宽和求（🔒4.11）；th/td 不折行须写 :deep()。
 * 单元格是 render 回调里 h() 出来的 VNode，scoped 类名加不上去 ⇒ 样式一律走内联 style。
 */
import { computed, h } from 'vue';
import type { VNodeChild } from 'vue';
import { NDataTable } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  bindingLabel,
  fmtMoney,
  fmtMoneyShort,
  fmtRatio,
  levelColor,
  ratioLevel,
  staleLabel,
  staleLevel,
  verdictLabel,
  verdictLevel
} from './utils';

defineOptions({ name: 'PortfolioSnapshotTable' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Irs.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
  /**
   * 档位口径首个追保：账户 → 首个 breached 的档位名（2026-11-13）。
   * 旧「全组同跌 11 档」临界跌幅已随风险看板页下线，这里不展示无法复现的数字。
   */
  levelFirstCall?: Record<string, string | null>;
}>();

/** 账户卡；ALL 时为 null */
const acctCard = computed(() => (props.account === 'ALL' ? null : props.board.accounts[props.account]));

const net = computed(() => acctCard.value?.net0 ?? props.board.net_total);
const margin = computed(() => acctCard.value?.margin ?? props.board.margin_total);
const fin = computed(() => {
  if (acctCard.value) return acctCard.value.fin;
  return Object.values(props.board.accounts).reduce((s, a) => s + a.fin, 0);
});
const equity = computed(() => net.value + fin.value);
const real = computed(() => acctCard.value?.real ?? props.board.real_total);
/** 交易所风险度：单账户用账户卡；ALL 取 0% 情景组合行 */
const exch = computed(() => {
  if (acctCard.value) return acctCard.value.exch;
  return props.board.grid.sync?.['0.0']?.ALL?.exch ?? null;
});
const coverage = computed(() => (margin.value > 0 ? net.value / margin.value : null));

/** 首个追保（档位口径）：五档中按到档价升序第一个触发 breached 的档名 */
const firstCall = computed<string | null>(() => props.levelFirstCall?.[props.account] ?? null);
const firstCallHint = computed(() => {
  const fc = firstCall.value;
  if (!fc) return '五档均未越线 · 模型口径，非实际追保通知';
  return `${props.account === 'ALL' ? '组合' : props.account} · 「${fc}」档首个越线`;
});

/** 预算卡：ALL 取汇总，单账户取该账户（skip=现货账户，不判） */
const budget = computed(() => props.board.budget);
const budgetCard = computed(() => (props.account === 'ALL' ? null : (budget.value.accounts[props.account] ?? null)));
const budgetVerdict = computed(() =>
  props.account === 'ALL' ? budget.value.summary.verdict : (budgetCard.value?.verdict ?? 'skip')
);
const budgetLots = computed(() =>
  props.account === 'ALL'
    ? Object.values(budget.value.accounts).reduce((s, a) => s + (a.verdict === 'block' ? 0 : a.lots), 0)
    : (budgetCard.value?.lots ?? 0)
);
const budgetHeadroom = computed(() =>
  props.account === 'ALL' ? budget.value.summary.headroom_total : (budgetCard.value?.headroom ?? null)
);
/** 额度文案必须带「压力口径」：B04 账面还有 35 万净值、总闸即期只差 14.6 万，只报 66.5 万会被当成算错 */
const budgetHint = computed(() => {
  const drop = `${Math.round(budget.value.stress_drop * 100)}%`;
  if (budgetVerdict.value === 'skip') return '现货/空仓账户，不套保证金预算';
  const parts = [verdictLabel(budgetVerdict.value, budgetLots.value)];
  if (budgetCard.value) parts.push(`卡在 ${bindingLabel(budgetCard.value.binding, budgetCard.value)}`);
  else if (budget.value.summary.blocked_accounts.length)
    parts.push(`禁开：${budget.value.summary.blocked_accounts.join('、')}`);
  parts.push(`判据=跌 ${drop} 后的保证金`);
  return parts.join(' · ');
});
/** 账实差（BS 重估），单账户且非 0 时才提示——不报出来会被当成算错 */
const bookGap = computed(() => budgetCard.value?.book_gap ?? 0);

// ---------------- 表格：单行 6 列，值全部塞进 row 保证响应式（render 不读外部 computed） ----------------
interface SnapshotRow {
  key: 'snapshot';
  net: string;
  netHint: string;
  margin: string;
  marginHint: string;
  realText: string;
  realColor: string;
  exchText: string;
  exchColor: string;
  riskHint: string;
  firstCallText: string;
  firstCallColor: string;
  firstCallHint: string;
  budgetText: string;
  budgetColor: string;
  budgetHint: string;
  staleText: string;
  staleColor: string;
  staleHint: string;
}

const rows = computed<SnapshotRow[]>(() => [
  {
    key: 'snapshot',
    net: fmtMoney(net.value),
    netHint: `融资 ${fmtMoney(fin.value)} · 权益 ${fmtMoney(equity.value)}`,
    margin: fmtMoney(margin.value),
    marginHint: `覆盖率 ${fmtRatio(coverage.value)}（净资产 / 保证金）`,
    realText: fmtRatio(real.value),
    realColor: levelColor(ratioLevel(real.value)),
    exchText: fmtRatio(exch.value),
    exchColor: levelColor(ratioLevel(exch.value)),
    riskHint: '追保判定看交易所口径',
    firstCallText: firstCall.value ? `${firstCall.value}档越线` : '未触发',
    firstCallColor: firstCall.value ? '#d03050' : '#18a058',
    firstCallHint: firstCallHint.value + (props.board.max_exposure_unbounded ? ' · 卖认购上行无上限' : ''),
    budgetText: budgetVerdict.value === 'skip' ? '不判' : fmtMoneyShort(budgetHeadroom.value),
    budgetColor: levelColor(verdictLevel(budgetVerdict.value)),
    budgetHint:
      budgetHint.value + (Math.abs(bookGap.value) > 0.5 ? ` · 账实差 ${fmtMoney(bookGap.value)}（BS 重估）` : ''),
    staleText: staleLabel(props.board.stale_days, props.board.data_as_of),
    staleColor: levelColor(staleLevel(props.board.stale_days)),
    staleHint: `${props.board.engine_ver} · 计算日 ${props.board.calc_date}`
  }
]);

/** 主值 + 一行小字口径；样式内联（render 回调里的 VNode 不吃 scoped 类名） */
function cell(main: VNodeChild, hint: string, color?: string) {
  return h('div', { style: 'min-width:0' }, [
    h(
      'div',
      {
        title: typeof main === 'string' ? main : undefined,
        style: {
          fontSize: '17px',
          fontWeight: '600',
          lineHeight: '1.3',
          color: color || undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      },
      [main]
    ),
    h(
      'div',
      {
        title: hint,
        style: {
          marginTop: '4px',
          fontSize: '11px',
          color: '#909399',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      },
      hint
    )
  ]);
}

/**
 * 列宽刻意压到总和 < 右栏常见可视宽度：scroll-x 只作窄屏保底，宽屏时 fixed layout
 * 会把剩余空间按比例放大各列 ⇒ 6 个指标一屏全见（否则最后一列要横向滚动才看得到）。
 */
const columns: DataTableColumns<SnapshotRow> = [
  { title: '净资产', key: 'net', width: 145, render: (r: SnapshotRow) => cell(r.net, r.netHint) },
  {
    title: '保证金占用',
    key: 'margin',
    width: 145,
    render: (r: SnapshotRow) => cell(r.margin, r.marginHint)
  },
  {
    title: '风险度（真实 / 交易所）',
    key: 'risk',
    width: 175,
    render: (r: SnapshotRow) =>
      cell(
        h('span', [
          h('span', { style: { color: r.realColor } }, r.realText),
          h('span', { style: { margin: '0 4px', color: '#c0c4cc', fontWeight: '400' } }, '/'),
          h('span', { style: { color: r.exchColor } }, r.exchText)
        ]),
        r.riskHint
      )
  },
  {
    title: '首个追保点（档位）',
    key: 'first_call',
    width: 145,
    render: (r: SnapshotRow) => cell(r.firstCallText, r.firstCallHint, r.firstCallColor)
  },
  {
    title: '可开额度（压力口径）',
    key: 'budget',
    width: 165,
    render: (r: SnapshotRow) => cell(r.budgetText, r.budgetHint, r.budgetColor)
  },
  {
    title: '行情新鲜度',
    key: 'stale',
    width: 175,
    render: (r: SnapshotRow) => cell(r.staleText, r.staleHint, r.staleColor)
  }
];

/** scroll-x = 叶子列宽和（🔒4.11）；窄屏可横向滚动，宽屏表头不被压折 */
const scrollX = columns.reduce((s, c) => s + Number(c.width ?? 0), 0);
</script>

<template>
  <!--
    table-layout 显式设 fixed：默认 auto 会让单元格里的长口径说明把列撑宽
    （实测「可开额度」被撑到 291px、最后一列挤出可视区）；fixed 后列宽只认 width，
    超长说明靠 overflow 省略、hover 看全文。
  -->
  <NDataTable
    :columns="columns"
    :data="rows"
    :pagination="false"
    :bordered="false"
    :scroll-x="scrollX"
    table-layout="fixed"
    :row-key="(r: SnapshotRow) => r.key"
  />
</template>

<style scoped>
/* th/td 由 NDataTable 子组件渲染，不折行须 :deep()（🔒4.11） */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
