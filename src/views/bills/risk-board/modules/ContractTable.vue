<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { fmtMoney, fmtPrice } from './utils';

defineOptions({ name: 'ContractTable' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Bills.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
}>();

const router = useRouter();

/** 当前账户视角的持仓（ALL 时展示全部） */
const rows = computed<Api.Bills.RiskBoardPosition[]>(() => {
  const all = props.board.positions ?? [];
  return props.account === 'ALL' ? all : all.filter(p => p.acct === props.account);
});

/** 品种标签：期货 / 认购 / 认沽 / 其他 */
function kindLabel(p: Api.Bills.RiskBoardPosition): string {
  if (p.kind === 'fut') return '期货';
  if (p.kind === 'call') return '认购';
  if (p.kind === 'put') return '认沽';
  return '其他';
}

/** 方向：期权用多/空，期货不展示 */
function sideTag(p: Api.Bills.RiskBoardPosition) {
  if (!p.side) return h('span', {}, '—');
  const isLong = p.side === 'long';
  return h(NTag, { size: 'small', type: isLong ? 'success' : 'warning' }, { default: () => (isLong ? '多' : '空') });
}

/** C/P 徽标 */
function cpTag(p: Api.Bills.RiskBoardPosition) {
  if (!p.cp) return h('span', {}, '—');
  return h(NTag, { size: 'small', type: p.cp === 'C' ? 'error' : 'info' }, { default: () => p.cp });
}

/** 最大亏损：null（卖认购）= 理论无上限，红字并注明是数学上界 */
function renderMaxLoss(p: Api.Bills.RiskBoardPosition) {
  if (p.max_loss === null) {
    return h('span', { style: 'color: #d03050; font-weight: 600' }, '无上限');
  }
  return fmtMoney(p.max_loss);
}

/** 期权行情页：行情只覆盖配置清单内的合约，缺行情时去这里补 */
function goOptionQuote() {
  router.push({ name: 'irs_option-quote' });
}

const columns: DataTableColumns<Api.Bills.RiskBoardPosition> = [
  {
    title: '合约',
    key: 'symbol',
    width: 130,
    fixed: 'left' as const,
    render: (p: Api.Bills.RiskBoardPosition) =>
      h(
        'span',
        {
          style: 'color: #2080f0; cursor: pointer',
          title: '去期权行情页同步/查看该合约行情',
          onClick: goOptionQuote
        },
        p.symbol
      )
  },
  { title: '账户', key: 'acct', width: 90 },
  { title: '品种', key: 'kind', width: 80, render: (p: Api.Bills.RiskBoardPosition) => kindLabel(p) },
  { title: '方向', key: 'side', width: 70, render: (p: Api.Bills.RiskBoardPosition) => sideTag(p) },
  { title: 'C/P', key: 'cp', width: 60, render: (p: Api.Bills.RiskBoardPosition) => cpTag(p) },
  { title: '张数', key: 'qty', width: 80, align: 'right' as const },
  {
    title: '行权价',
    key: 'strike',
    width: 90,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => (p.strike === null ? '—' : fmtPrice(p.strike))
  },
  {
    title: '到期天数',
    key: 'days',
    width: 90,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => (p.days === null ? '—' : String(p.days))
  },
  {
    title: 'IV',
    key: 'sigma',
    width: 80,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => (p.sigma === null ? '—' : `${(p.sigma * 100).toFixed(2)}%`)
  },
  {
    title: 'delta',
    key: 'delta',
    width: 80,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => (p.delta === null ? '—' : p.delta.toFixed(3))
  },
  {
    title: '盯市单价',
    key: 'px',
    width: 100,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => (p.px === null ? '—' : fmtPrice(p.px))
  },
  {
    title: '当前保证金',
    key: 'margin_now',
    width: 110,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => fmtMoney(p.margin_now)
  },
  {
    title: '最大亏损',
    key: 'max_loss',
    width: 110,
    align: 'right' as const,
    render: (p: Api.Bills.RiskBoardPosition) => renderMaxLoss(p)
  }
];
</script>

<template>
  <NCard :bordered="false" class="card-wrapper" size="small">
    <template #header>
      <div class="contract-header">
        <span>逐张合约（{{ rows.length }}）</span>
        <span class="contract-note">「无上限」为数学上界，非风险预算</span>
      </div>
    </template>
    <NDataTable
      :columns="columns"
      :data="rows"
      :pagination="false"
      :bordered="false"
      size="small"
      :row-key="(p: Api.Bills.RiskBoardPosition) => `${p.acct}-${p.symbol}`"
      :max-height="420"
      virtual-scroll
    />
  </NCard>
</template>

<style scoped>
.contract-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.contract-note {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}
</style>
