<script setup lang="ts">
defineOptions({ name: 'ValuationTable' });

/**
 * 估值分位明细表（IRs 决策区）
 *
 * 所有数字都来自 `/bds/index-valuation-percentiles`，本组件不做任何计算，只做格式化。
 * 窗口口径：自然日回溯（3/5/10 年 = 1095/1825/3650 天），由后端保证唯一——
 * 前端若自己算窗口，必然与后端出现两套口径。
 */
interface Props {
  items: Api.Bds.IndexValuationPercentile[];
  metricLabel: string;
}

const props = defineProps<Props>();

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(digits);
}

function pctCell(stat?: Api.Bds.IndexValuationStat): string {
  if (!stat || stat.pct == null) return '-';
  return `${stat.pct.toFixed(1)}%`;
}

function rangeCell(stat?: Api.Bds.IndexValuationStat): string {
  if (!stat || stat.min == null || stat.max == null) return '-';
  return `${fmt(stat.min)} ~ ${fmt(stat.max)}`;
}

function freshCell(row: Api.Bds.IndexValuationPercentile): string {
  if (!row.last_change_date) return '-';
  const gap = row.constituent_gap_days || 0;
  const base = `名单自 ${row.last_change_date} 未变`;
  if (row.constituent_stale) return `${base}（核查至 ${row.constituent_checked_to || '-'}，滞后）`;
  return gap > 0 ? `${base}（${gap} 天未确认）` : base;
}

/** 行键：指数代码唯一 */
function rowKey(r: Api.Bds.IndexValuationPercentile) {
  return r.index_code;
}

const columns = [
  { title: '指数', key: 'sec_name', width: 100 },
  { title: '当前值', key: 'current', width: 90, render: (row: Api.Bds.IndexValuationPercentile) => fmt(row.current) },
  {
    title: '3年分位',
    key: 'pct_3y',
    width: 90,
    render: (row: Api.Bds.IndexValuationPercentile) => pctCell(row.pct_3y)
  },
  {
    title: '5年分位',
    key: 'pct_5y',
    width: 90,
    render: (row: Api.Bds.IndexValuationPercentile) => pctCell(row.pct_5y)
  },
  {
    title: '10年分位',
    key: 'pct_10y',
    width: 95,
    render: (row: Api.Bds.IndexValuationPercentile) => pctCell(row.pct_10y)
  },
  {
    title: '全历史分位',
    key: 'pct_all',
    width: 100,
    render: (row: Api.Bds.IndexValuationPercentile) => pctCell(row.pct_all)
  },
  { title: 'z(5年)', key: 'z5y', width: 85, render: (row: Api.Bds.IndexValuationPercentile) => fmt(row.pct_5y?.z) },
  {
    title: '10年中位数',
    key: 'median10y',
    width: 105,
    render: (row: Api.Bds.IndexValuationPercentile) => fmt(row.pct_10y?.median)
  },
  {
    title: '10年区间',
    key: 'range10y',
    width: 130,
    render: (row: Api.Bds.IndexValuationPercentile) => rangeCell(row.pct_10y)
  },
  {
    title: '样本数(10年)',
    key: 'n10y',
    width: 110,
    render: (row: Api.Bds.IndexValuationPercentile) => String(row.pct_10y?.n ?? 0)
  },
  { title: '成分新鲜度', key: 'fresh', width: 260, render: (row: Api.Bds.IndexValuationPercentile) => freshCell(row) }
];
</script>

<template>
  <div>
    <div class="mb-8px text-12px op-60">
      当前 {{ metricLabel }}；全历史分位仅作参考（PE 中枢长期下移，会系统性显得「便宜」），决策以 10 年分位为主。
    </div>
    <NDataTable :columns="columns" :data="props.items" :row-key="rowKey" size="small" />
  </div>
</template>
