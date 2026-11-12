<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { deltaPnlHeader, fmtMoney, fmtPrice, pnl, scenarioLabel } from './utils';

defineOptions({ name: 'ContractTable' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Irs.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
  /** 情景模式（与情景压力表一致） */
  mode: string;
  /** 情景压力表当前选中的档位；默认 0% */
  step: number;
}>();

const router = useRouter();

/** 当前账户视角的持仓（ALL 时展示全部） */
const rows = computed<Api.Irs.RiskBoardPosition[]>(() => {
  const all = props.board.positions ?? [];
  return props.account === 'ALL' ? all : all.filter(p => p.acct === props.account);
});

/** 后端 grid 的键：0 写成 '0.0'，其余与 JS 数字串一致 */
function gridKey(drop: number): string {
  return drop === 0 ? '0.0' : String(drop);
}

/** 选中档位下 ALL 行的逐仓情景明细，键 = 账户-合约（与明细表 row-key 一致）。 */
const detailMap = computed(() => {
  const m = new Map<string, Api.Irs.RiskBoardDetail>();
  const cell = props.board.grid[props.mode]?.[gridKey(props.step)]?.ALL;
  (cell?.detail ?? []).forEach(d => m.set(`${d.acct}-${d.name}`, d));
  return m;
});

/**
 * 两列 Δ 盈亏的时点前缀固定（2026-11-12 取消「时点口径」切换，与标的五档风险指标一致）：
 * 主列恒为即期、对照列恒为到期，列名不再随查询参数变动。
 * 列名不写「标的」——那是统计范围，与「到期」不是同一维度。
 */
const mainLabel = '即期';
const otherLabel = '到期';
const stepLabel = computed(() => scenarioLabel(props.step));

/** 逐张合约表的统计范围：全组同跌情景下所有持仓都重估，与「其它持仓冻结」的到档情景不同 */
const CONTRACT_SCOPE_NOTE =
  '两列都是该合约在所选情景档位下相对当前的 Δ（V(S1)−V(S0)），全组持仓同步重估、没有冻结行；证券/期货两列恒等，差异只来自期权时间价值。与「当前盈亏」的账面口径基准不同，不可相加对账。';

/**
 * 模型盯市 Δ 盈亏：后端 loss 正=亏，展示口径正=盈，故取反。
 * detail 缺失（未开 detail=true 或该合约不在风险上下文）返回 null 显示 '—'，不伪造 0。
 */
function deltaPnl(p: Api.Irs.RiskBoardPosition, key: 'loss' | 'loss_other'): number | null {
  const v = detailMap.value.get(`${p.acct}-${p.symbol}`)?.[key];
  return v === null || v === undefined ? null : -Number(v);
}

/** 品种标签：期货 / 认购 / 认沽 / 其他 */
function kindLabel(p: Api.Irs.RiskBoardPosition): string {
  if (p.kind === 'fut') return '期货';
  if (p.kind === 'call') return '认购';
  if (p.kind === 'put') return '认沽';
  return '其他';
}

/** 方向：期权用多/空，期货不展示 */
function sideTag(p: Api.Irs.RiskBoardPosition) {
  if (!p.side) return h('span', {}, '—');
  const isLong = p.side === 'long';
  return h(NTag, { size: 'small', type: isLong ? 'success' : 'warning' }, { default: () => (isLong ? '多' : '空') });
}

/** C/P 徽标 */
function cpTag(p: Api.Irs.RiskBoardPosition) {
  if (!p.cp) return h('span', {}, '—');
  return h(NTag, { size: 'small', type: p.cp === 'C' ? 'error' : 'info' }, { default: () => p.cp });
}

/** 最大亏损：null（卖认购）= 理论无上限，红字并注明是数学上界 */
function renderMaxLoss(p: Api.Irs.RiskBoardPosition) {
  if (p.max_loss === null) {
    return h('span', { style: 'color: #d03050; font-weight: 600' }, '无上限');
  }
  return fmtMoney(p.max_loss);
}

/**
 * 保证金效率 = |delta × 名义市值| ÷ 当前保证金（方案改造 5 的减仓排序键）。
 * 每 1 元保证金换来多少方向敞口：越低越该先平。
 * 名义敞口排不出序（卖 put 的名义远大于保证金），必须用 delta 加权。
 */
function marginEfficiency(p: Api.Irs.RiskBoardPosition): number | null {
  if (!p.margin_now || p.delta === null) return null;
  return (Math.abs(p.delta) * p.nominal) / p.margin_now;
}

function renderEfficiency(p: Api.Irs.RiskBoardPosition) {
  const v = marginEfficiency(p);
  if (v === null) return '—';
  // <1 说明保证金买不到等量的方向敞口，标红提示优先处置
  return h('span', { style: v < 1 ? 'color: #d03050; font-weight: 600' : '' }, v.toFixed(2));
}

/** 期权行情页：行情只覆盖配置清单内的合约，缺行情时去这里补 */
function goOptionQuote() {
  router.push({ name: 'irs_option-quote' });
}

/**
 * 时点口径固定后两列标题不再变化，列定义可静态化；render 内仍读 detailMap.value，
 * 所以情景档位切换照常联动（历史上标题随时点变动才必须用 computed，🔒 踩过坑）。
 */
const columns: DataTableColumns<Api.Irs.RiskBoardPosition> = [
  {
    title: '合约',
    key: 'symbol',
    width: 175,
    render: (p: Api.Irs.RiskBoardPosition) =>
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
  { title: '品种', key: 'kind', width: 80, render: (p: Api.Irs.RiskBoardPosition) => kindLabel(p) },
  { title: '方向', key: 'side', width: 70, render: (p: Api.Irs.RiskBoardPosition) => sideTag(p) },
  { title: 'C/P', key: 'cp', width: 60, render: (p: Api.Irs.RiskBoardPosition) => cpTag(p) },
  { title: '张数', key: 'qty', width: 80, align: 'right' as const },
  {
    title: '行权价',
    key: 'strike',
    width: 90,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => (p.strike === null ? '—' : fmtPrice(p.strike))
  },
  {
    title: '到期天数',
    key: 'days',
    width: 90,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => (p.days === null ? '—' : String(p.days))
  },
  {
    title: 'IV',
    key: 'sigma',
    width: 80,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => (p.sigma === null ? '—' : `${(p.sigma * 100).toFixed(2)}%`)
  },
  {
    title: 'delta',
    key: 'delta',
    width: 80,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => (p.delta === null ? '—' : p.delta.toFixed(3))
  },
  {
    title: '盯市单价',
    key: 'px',
    width: 100,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => (p.px === null ? '—' : fmtPrice(p.px))
  },
  {
    title: '当前保证金',
    key: 'margin_now',
    width: 110,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => fmtMoney(p.margin_now)
  },
  {
    title: '当前盈亏',
    key: 'pf_now',
    width: 120,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => pnl(p.pf_now)
  },
  {
    title: deltaPnlHeader(mainLabel, CONTRACT_SCOPE_NOTE),
    key: 'delta_pnl',
    width: 130,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => pnl(deltaPnl(p, 'loss'))
  },
  {
    title: deltaPnlHeader(otherLabel, CONTRACT_SCOPE_NOTE),
    key: 'other_delta_pnl',
    width: 130,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => pnl(deltaPnl(p, 'loss_other'))
  },
  {
    title: '最大亏损',
    key: 'max_loss',
    width: 110,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => renderMaxLoss(p)
  },
  {
    title: '保证金效率',
    key: 'margin_eff',
    width: 110,
    align: 'right' as const,
    render: (p: Api.Irs.RiskBoardPosition) => renderEfficiency(p)
  }
];
</script>

<template>
  <NCard :bordered="false" class="card-wrapper" size="small">
    <template #header>
      <div class="contract-header">
        <span>逐张合约（{{ rows.length }}）</span>
        <span class="contract-note">Δ盈亏对应情景档位：{{ stepLabel }}（点击上方情景压力表切换）</span>
        <span class="contract-note">「无上限」为数学上界，非风险预算</span>
      </div>
    </template>
    <NDataTable
      :columns="columns"
      :data="rows"
      :pagination="false"
      :bordered="false"
      :row-key="(p: Api.Irs.RiskBoardPosition) => `${p.acct}-${p.symbol}`"
      :scroll-x="1705"
      :max-height="420"
      virtual-scroll
    />
    <!--
 <div class="table-note">
      「当前盈亏」为账单账面浮盈（静态）；两列Δ盈亏为所选情景档位下的模型盯市增量
      [推算]，列名固定不切换：即期列为组合主口径、到期列为终局对照，正=盈、负=亏，与账面口径不同源、不可相加对账。默认
      0% 档时即期Δ盈亏为 0（到期列仍含时间价值归零）。
    </div> 
-->
  </NCard>
</template>

<style scoped>
/*
 * 单元格一律不折行：合约名（CFFEX.IO2611-P-4000）在 130px 列里会断成两行，
 * 把行高撑成两倍，与全站其他列表页不一致。
 * :deep() 是必须的——th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上，
 * 直接写 .n-data-table-td 无效且不报错。
 * 配合 columns 宽度（合计 1705）与 scroll-x，列宽才是硬约束。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}

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

.table-note {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
