<script setup lang="ts">
import { h } from 'vue';

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
    // 当前值属于哪一天：估值未跟上时必须让读的人看见，否则会把 T-N 的值当"今天"用
    title: '数据截至',
    key: 'as_of',
    width: 105,
    render: (row: Api.Bds.IndexValuationPercentile) => {
      if (!row.as_of) return '-';
      return row.is_stale
        ? h('span', { style: 'color: #ef9f27; font-weight: 600' }, `${row.as_of}（落后${row.stale_days}天）`)
        : row.as_of;
    }
  },
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
    title: '全历史分位*',
    key: 'pct_all',
    width: 105,
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
      当前 {{ metricLabel }}；分位 = 窗口内 ≤ 当前值的样本占比（
      <b>含当前值自身</b>
      ，故最低不为 0、 当前即历史最高时恒为 100%）。决策以 10 年分位为主；
      <b>* 全历史</b>
      跨股权分置改革与会计准则变更，仅作参考，勿与 10 年分位并排比较。
      <template v-if="metricLabel.includes('中位')">
        <b>中位 PE 只含 PE>0 样本</b>
        （亏损股被剔除），与整体法 PE 的抽样池不同，两者分位不可互相印证。
      </template>
    </div>
    <NDataTable :columns="columns" :data="props.items" :row-key="rowKey" size="small" />
  </div>
</template>
