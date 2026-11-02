<script setup lang="ts">
import { computed, h } from 'vue';

defineOptions({ name: 'ValuationTable' });

/**
 * 估值分位明细表（IRs 决策区）
 *
 * 所有数字都来自后端分位接口（指数 `/bds/index-valuation-percentiles`、
 * 个股 `/bds/stock-valuation-percentiles`），本组件不做任何计算，只做格式化。
 * 窗口口径：自然日回溯（3/5/10 年 = 1095/1825/3650 天），由后端保证唯一——
 * 前端若自己算窗口，必然与后端出现两套口径。
 */
interface Props {
  items: (Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile)[];
  metricLabel: string;
  /** 指标键：识别 dy_ttm 加反向注记 */
  metric: string;
  /** index=指数模式；stock=个股模式（"成分新鲜度"列换成"覆盖区间"） */
  mode: 'index' | 'stock';
}

const props = defineProps<Props>();

type Row = Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile;

function isIndex(row: Row): row is Api.Bds.IndexValuationPercentile {
  return 'index_code' in row;
}

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

/** 个股覆盖列：上市/数据区间/样本数；当前值无效时给原因 */
function stockCell(row: Api.Bds.StockValuationPercentile): string {
  if (row.status === 'no_data') return '估值源无数据';
  const base = `${row.online_date || '-'} 上市 · ${row.first_date || '-'} ~ ${row.last_date || '-'}（有效 ${row.cleaned_n} 天）`;
  if (row.status === 'loss') return `${base}；${row.status_note || '当前值无效'}`;
  if (row.windows_short.length) {
    return `${base}；${row.windows_short.map(w => w.replace('pct_', '')).join('、')} 年样本不足`;
  }
  return base;
}

/** 行键：指数用 index_code，个股用 symbol */
function rowKey(r: Row) {
  return isIndex(r) ? r.index_code : r.symbol;
}

const columns = computed(() => {
  const cols: any[] = [
    {
      title: props.mode === 'stock' ? '个股' : '指数',
      key: 'sec_name',
      width: 100,
      render: (row: Row) => row.sec_name || rowKey(row)
    },
    { title: '当前值', key: 'current', width: 92, render: (row: Row) => fmt(row.current) },
    {
      // 当前值属于哪一天：估值未跟上时必须让读的人看见，否则会把 T-N 的值当"今天"用
      title: '数据截至',
      key: 'as_of',
      width: 210,
      render: (row: Row) => {
        if (!row.as_of) return '-';
        return row.is_stale
          ? h('span', { style: 'color: #ef9f27; font-weight: 600' }, `${row.as_of}（落后${row.stale_days}天）`)
          : row.as_of;
      }
    },
    { title: '3年分位', key: 'pct_3y', width: 92, render: (row: Row) => pctCell(row.pct_3y) },
    { title: '5年分位', key: 'pct_5y', width: 92, render: (row: Row) => pctCell(row.pct_5y) },
    { title: '10年分位', key: 'pct_10y', width: 100, render: (row: Row) => pctCell(row.pct_10y) },
    { title: '全历史分位*', key: 'pct_all', width: 122, render: (row: Row) => pctCell(row.pct_all) },
    { title: 'z(5年)', key: 'z5y', width: 88, render: (row: Row) => fmt(row.pct_5y?.z) },
    { title: '10年中位数', key: 'median10y', width: 116, render: (row: Row) => fmt(row.pct_10y?.median) },
    { title: '10年区间', key: 'range10y', width: 148, render: (row: Row) => rangeCell(row.pct_10y) },
    { title: '样本数(10年)', key: 'n10y', width: 124, render: (row: Row) => String(row.pct_10y?.n ?? 0) }
  ];
  if (props.mode === 'stock') {
    cols.push({
      // 个股模式：上市/覆盖信息（最坏文本带 loss 原因，420 与指数列同宽）
      title: '覆盖区间',
      key: 'coverage',
      width: 420,
      render: (row: Row) => stockCell(row as Api.Bds.StockValuationPercentile)
    });
  } else {
    cols.push({
      // 实测最坏文本（带「核查至 … 滞后」）在 14px 下 346px，按 420（可用 396）给，留足余量
      title: '成分新鲜度',
      key: 'fresh',
      width: 420,
      render: (row: Row) => freshCell(row as Api.Bds.IndexValuationPercentile)
    });
  }
  return cols;
});

/** 与 columns 宽度合计一致；小于该值时会压缩列宽导致折行，故固定给足 */
const TABLE_SCROLL_X = 1704;
</script>

<template>
  <div>
    <div class="mb-8px text-12px op-60">
      当前 {{ metricLabel }}；分位 = 窗口内 ≤ 当前值的样本占比（
      <b>含当前值自身</b>
      ，故最低不为 0、 当前即历史最高时恒为 100%）。决策以 10 年分位为主；
      <b>* 全历史</b>
      跨股权分置改革与会计准则变更，仅作参考，勿与 10 年分位并排比较。
      <template v-if="metric === 'dy_ttm'">
        <b>股息率为反向指标</b>
        （分位高=股息高=便宜），表内数字为原始分位，卡片染色已按便宜度反转。
      </template>
      <template v-else-if="metricLabel.includes('中位')">
        <b>中位 PE 只含 PE&gt;0 样本</b>
        （亏损股被剔除），与整体法 PE 的抽样池不同，两者分位不可互相印证。
      </template>
      <template v-else-if="metricLabel.includes('PCF')">
        <b>PCF 只含正经营现金流样本</b>
        （负现金流成分在分子分母里一并剔除，与 PE 亏损计入的口径不同）， 故其成分范围小于同指数其他指标，分位不可与 PE
        分位直接并列比较。
      </template>
      <template v-if="mode === 'stock'">
        <b>个股口径</b>
        ：亏损期负 PE、净资产为负的负 PB、现金流为负的负 PCF
        不参与分位（避免"亏损当便宜"）；上市不足窗口期时对应分位样本不足，参考价值打折。
      </template>
    </div>
    <NDataTable :columns="columns" :data="props.items" :row-key="rowKey" :scroll-x="TABLE_SCROLL_X" />
  </div>
</template>

<style scoped>
/* 单元格一律不折行：这页数据行数少，行高参差比横向滚动更难读。
   宽度已在 columns 里按最长内容给足，故 nowrap 不会触发溢出截断。 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
