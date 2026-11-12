<script setup lang="ts">
import { computed, h } from 'vue';
import { NTag, NTooltip } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  bindingLabel,
  fmtMoney,
  fmtMoneyShort,
  fmtRatio,
  firstCallLabel,
  firstCallLevel,
  levelColor,
  metricHeader,
  pnl,
  ratioLevel,
  realOverLine,
  verdictLevel
} from './utils';

defineOptions({ name: 'AccountRiskList' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Irs.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
}>();

const emit = defineEmits<{ (e: 'select', account: string): void }>();

interface AccountRow {
  /** 账户名；ALL 表示组合 */
  account: string;
  /** 账户卡；组合行为 null */
  card: Api.Irs.RiskBoardAccount | null;
  net: number;
  fin: number;
  eq: number;
  margin: number;
  real: number | null;
  exch: number | null;
  /** 账户风险敞口（人工确认口径）；null = 未设置 */
  risk_exposure: number | null;
  /** 账户账面浮盈（bills_group_acc.pf_total） */
  pf_now: number;
  /** 该账户首个追保点 */
  firstCall: Api.Irs.RiskBoardFirstCall | null;
  /** 预算卡；组合行为 null */
  budget: Api.Irs.BudgetAccount | null;
}

/**
 * 组合行在前，账户行按风险敞口倒序（null = 未设置排最后，同账户内按名称稳定排序）。
 * 空账户（无净值且无保证金）整行过滤：列表只看有仓账户，豁免口径由后端判定兜底。
 */
const rows = computed<AccountRow[]>(() => {
  const finTotal = Object.values(props.board.accounts).reduce((s, a) => s + (a.fin ?? 0), 0);
  const allRow: AccountRow = {
    account: 'ALL',
    card: null,
    net: props.board.net_total,
    fin: finTotal,
    eq: props.board.net_total + finTotal,
    margin: props.board.margin_total,
    real: props.board.real_total,
    exch: props.board.grid.sync?.['0.0']?.ALL?.exch ?? null,
    risk_exposure: props.board.risk_exposure_total ?? null,
    pf_now: props.board.pf_now_total,
    firstCall: props.board.first_call.sync ?? null,
    budget: null
  };

  const acctRows = Object.keys(props.board.accounts)
    .sort()
    .map(name => {
      const card = props.board.accounts[name];
      return {
        account: name,
        card,
        net: card.net0,
        fin: card.fin,
        eq: card.eq,
        margin: card.margin,
        real: card.real,
        exch: card.exch,
        risk_exposure: card.risk_exposure ?? null,
        pf_now: card.pf_now,
        firstCall: props.board.first_call_all.sync?.[name] ?? null,
        budget: props.board.budget.accounts[name] ?? null
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

/** 账户列：名称 + 状态标签（已追保 / 真实口径越线，越线悬停给口径说明） */
function accountCell(row: AccountRow) {
  const name = row.account === 'ALL' ? '组合' : row.account;
  let tag = null;
  if (row.firstCall?.direction === 'now') {
    tag = h(NTag, { size: 'small' }, { default: () => '已追保' });
  } else if (realOverLine(row.real)) {
    tag = h(
      NTooltip,
      { trigger: 'hover' },
      {
        trigger: () => h(NTag, { size: 'small', type: 'warning', bordered: false }, { default: () => '真实口径越线' }),
        default: () =>
          `保证金 ${fmtMoney(row.margin)} 已超过自有净值 ${fmtMoney(row.net)}，缺口由融资 ${fmtMoney(
            row.fin
          )} 填补。交易所口径尚未触发券商追保，但自有资金已无缓冲。`
      }
    );
  }
  return h('span', { class: 'acct-cell' }, [h('span', { class: 'acct-name' }, name), tag]);
}

/** 风险度双口径：真实着色（预警用真实）、交易所着色，空值显示 '-' */
function riskCell(row: AccountRow) {
  return h('span', { class: 'acct-value' }, [
    h('span', { style: { color: levelColor(ratioLevel(row.real)) } }, fmtRatio(row.real)),
    h('span', { class: 'sep' }, '/'),
    h('span', { style: { color: levelColor(ratioLevel(row.exch)) } }, fmtRatio(row.exch))
  ]);
}

/** 账户净值 / 权益 / 融资列头口径：三者是一条恒等式的三个面，说明放一处防混读 */
const netHeader = metricHeader('账户净值', [
  '自有资金口径：账户价值 − 融资余额（acc_aset − diff_br），已按模型盯市修正。',
  '是真实风险度的分母；组合行 = 各账户之和。'
]);
const eqHeader = metricHeader('账户权益', [
  '客户权益 = 账户净值 + 账户融资（交易所口径，融资已含在内）。',
  '是交易所风险度的分母；组合行 = 各账户之和。'
]);
const finHeader = metricHeader('账户融资', [
  '融资余额（bills_group_acc.diff_br）：自有资金之外借入的部分。',
  '不含在账户净值里、已含在账户权益里 ⇒ 权益 − 融资 = 净值。'
]);

/** 风险敞口 / 当前盈亏列头口径（metricHeader 与五档表共用一份 helpTip 触发器） */
const exposureHeader = metricHeader('风险敞口', [
  '账户内各账单风险敞口之和（bills_group_acc.risk_exposure，人工确认口径，含账户全部持仓）。',
  'null = 未设置，显示 "-" 且排最后；组合行 = 各账户之和。'
]);
const pfHeader = metricHeader('当前盈亏', [
  '账户层面全部持仓的账面浮盈（bills_group_acc.pf_total）。',
  '静态账面口径，与情景 Δ 盈亏不同源，不可相加对账。'
]);

/**
 * 预算行文案。缺口一律注明「压力口径」——那是跌 15% 之后的保证金，
 * 与即期缺口差好几倍，不注明会被读成"现在就亏了这么多"。
 */
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
 * 列宽合计 1330 = 160+120+110×6+170+220，与 scroll-x 一致才是硬约束。
 * 融资/权益自 2026-11-12 拆为「账户权益」「账户融资」两独立列（权益在前）；风险度保留双值并列口径。
 */
const columns: DataTableColumns<AccountRow> = [
  { title: '账户', key: 'account', width: 160, render: (r: AccountRow) => accountCell(r) },
  {
    title: exposureHeader,
    key: 'risk_exposure',
    width: 120,
    align: 'right' as const,
    render: (r: AccountRow) => fmtMoney(r.risk_exposure)
  },
  {
    title: eqHeader,
    key: 'eq',
    width: 110,
    align: 'right' as const,
    render: (r: AccountRow) => fmtMoney(r.eq)
  },
  {
    title: finHeader,
    key: 'fin',
    width: 110,
    align: 'right' as const,
    render: (r: AccountRow) => fmtMoney(r.fin)
  },
  { title: netHeader, key: 'net', width: 110, align: 'right' as const, render: (r: AccountRow) => fmtMoney(r.net) },
  { title: pfHeader, key: 'pf_now', width: 110, align: 'right' as const, render: (r: AccountRow) => pnl(r.pf_now) },
  {
    title: '当前保证金',
    key: 'margin',
    width: 110,
    align: 'right' as const,
    render: (r: AccountRow) => fmtMoney(r.margin)
  },
  { title: '风险度 真实/交易所', key: 'real', width: 170, align: 'right' as const, render: riskCell },
  {
    title: '首个追保',
    key: 'first_call',
    width: 110,
    align: 'right' as const,
    render: (r: AccountRow) =>
      h('span', { style: { color: levelColor(firstCallLevel(r.firstCall)) } }, firstCallLabel(r.firstCall))
  },
  {
    title: '可开额度',
    key: 'budget',
    width: 220,
    render: (r: AccountRow) => h('span', { style: { color: budgetColor(r) } }, budgetText(r))
  }
];
</script>

<template>
  <!--
    2026-11-12 由卡片栅格改为列表：一行一账户，点击行切换账户视角（联动下方情景/合约表）。
    账户行按风险敞口倒序、空账户过滤（2026-11-12 下午追加需求）。
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
    :scroll-x="1330"
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

.acct-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.acct-name {
  font-weight: 600;
}

.acct-value {
  font-variant-numeric: tabular-nums;
}

.sep {
  margin: 0 2px;
  color: #c0c4cc;
}
</style>
