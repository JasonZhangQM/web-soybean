<script setup lang="ts">
import { computed, h } from 'vue';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { fmtMoney, fmtRatio, levelColor, ratioLevel, scenarioLabel } from './utils';

defineOptions({ name: 'ScenarioTable' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Bills.RiskBoard;
  /** 情景模式 */
  mode: string;
  /** 当前账户：ALL 或具体账户 */
  account: string;
}>();

interface Row {
  /** 后端原始档位：正=跌幅，负=涨幅 */
  drop: number;
  /** 展示用涨跌幅标签 */
  label: string;
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

const rows = computed<Row[]>(() => {
  const grid = props.board.grid[props.mode] ?? {};
  return props.board.steps.map(drop => {
    const cell = grid[gridKey(drop)]?.[props.account];
    return {
      drop,
      label: scenarioLabel(drop),
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
    title: '组合亏损',
    key: 'loss',
    width: 130,
    align: 'right' as const,
    render: (r: Row) => h('span', { style: { color: r.loss > 0 ? '#d03050' : '#18a058' } }, fmtMoney(r.loss))
  },
  { title: '剩余净值', key: 'net', width: 130, align: 'right' as const, render: (r: Row) => fmtMoney(r.net) },
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

/** 0% 行浅绿、首个追保行浅红 */
function rowProps(row: Row) {
  if (row.drop === 0) return { style: 'background: rgba(24, 160, 88, 0.08)' };
  const idx = rows.value.indexOf(row);
  if (idx === breachIndex.value) return { style: 'background: rgba(208, 48, 80, 0.08)' };
  return {};
}
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="rows"
    :row-props="rowProps"
    :pagination="false"
    :bordered="false"
    size="small"
    :row-key="(r: Row) => r.drop"
  />
  <div class="table-note">负数=涨幅（上行情景），正数=跌幅；红色行=该账户首个触发追保的档位。</div>
</template>

<style scoped>
.table-note {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
