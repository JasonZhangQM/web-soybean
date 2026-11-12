<script setup lang="ts">
import { computed, h } from 'vue';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { fmtMoney, fmtRatio, levelColor, pnl, ratioLevel, scenarioLabel } from './utils';

defineOptions({ name: 'ScenarioTable' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Irs.RiskBoard;
  /** 情景模式 */
  mode: string;
  /** 当前账户：ALL 或具体账户 */
  account: string;
  /** 当前选中的情景档位（默认 0%，点击行切换） */
  step: number;
}>();

const emit = defineEmits<{ select: [drop: number] }>();

interface Row {
  /** 后端原始档位：正=跌幅，负=涨幅 */
  drop: number;
  /** 展示用涨跌幅标签 */
  label: string;
  /** 账户层面账面浮盈：11 档恒定，与情景无关 */
  pf_now: number;
  /** 组合亏损（正=亏），展示时取反为「组合盈亏」 */
  loss: number;
  net: number;
  margin: number;
  real: number | null;
  exch: number | null;
  breached: boolean;
}

/** 后端 grid 的键：0 写成 '0.0'，其余与 JS 数字串一致 */
function gridKey(drop: number): string {
  return drop === 0 ? '0.0' : String(drop);
}

/** 账户当前盈亏：ALL 取组合合计，其余取该账户卡。账面口径，11 档恒定。 */
const accountPfNow = computed(() =>
  props.account === 'ALL' ? props.board.pf_now_total : (props.board.accounts[props.account]?.pf_now ?? 0)
);

const rows = computed<Row[]>(() => {
  const grid = props.board.grid[props.mode] ?? {};
  return props.board.steps.map(drop => {
    const cell = grid[gridKey(drop)]?.[props.account];
    return {
      drop,
      label: scenarioLabel(drop),
      pf_now: accountPfNow.value,
      loss: cell?.loss ?? 0,
      net: cell?.net ?? 0,
      margin: cell?.margin ?? 0,
      real: cell?.real ?? null,
      exch: cell?.exch ?? null,
      breached: cell?.breached ?? false
    };
  });
});

/** 首个触发追保的档位下标（用于整行标红） */
const breachIndex = computed(() => rows.value.findIndex(r => r.breached));

const columns: DataTableColumns<Row> = [
  {
    title: '涨跌幅',
    key: 'label',
    width: 90,
    render: (r: Row) => h('span', { style: 'font-weight: 600' }, r.label)
  },
  {
    title: '账户当前盈亏',
    key: 'pf_now',
    width: 140,
    align: 'right' as const,
    render: (r: Row) => pnl(r.pf_now)
  },
  {
    // 后端 loss 正=亏；展示口径改为正=盈、负=亏，故取反
    title: '组合盈亏',
    key: 'loss',
    width: 130,
    align: 'right' as const,
    render: (r: Row) => pnl(-r.loss)
  },
  { title: '账户净值', key: 'net', width: 130, align: 'right' as const, render: (r: Row) => fmtMoney(r.net) },
  { title: '保证金', key: 'margin', width: 130, align: 'right' as const, render: (r: Row) => fmtMoney(r.margin) },
  {
    title: '真实风险度',
    key: 'real',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => h('span', { style: { color: levelColor(ratioLevel(r.real)) } }, fmtRatio(r.real))
  },
  {
    title: '交易所风险度',
    key: 'exch',
    width: 120,
    align: 'right' as const,
    render: (r: Row) => h('span', { style: { color: levelColor(ratioLevel(r.exch)) } }, fmtRatio(r.exch))
  },
  {
    title: '追保',
    key: 'breached',
    width: 80,
    render: (r: Row) =>
      r.breached ? h(NTag, { type: 'error', size: 'small' }, { default: () => '追保' }) : h('span', {}, '—')
  }
];

/** 0% 行浅绿、首个追保行浅红；选中行加蓝色左边条（不覆盖追保配色）。 */
function rowProps(row: Row) {
  const parts: string[] = ['cursor: pointer'];
  if (row.drop === 0) parts.push('background: rgba(24, 160, 88, 0.08)');
  const idx = rows.value.indexOf(row);
  if (idx === breachIndex.value) parts.push('background: rgba(208, 48, 80, 0.08)');
  if (row.drop === props.step) parts.push('box-shadow: inset 3px 0 0 #2080f0');
  return { style: parts.join('; '), onClick: () => emit('select', row.drop) };
}
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="rows"
    :row-props="rowProps"
    :pagination="false"
    :bordered="false"
    :row-key="(r: Row) => r.drop"
    :scroll-x="930"
  />
  <!--
 <div class="table-note">
    涨跌幅列：负数=涨幅、正数=跌幅；盈亏列：正数=盈利、负数=亏损。点击任意行切换下方「逐张合约」的情景档位（默认
    0%，此时 Δ 盈亏为 0）。红色行=该账户首个触发追保的档位。
  </div> 
--></template>

<style scoped>
/* 单元格不折行：11 档情景表窄列多，换行会把行高参差拉开，与全站列表页不一致。
   :deep() 是必须的——th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上。 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}

.table-note {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
