<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';

defineOptions({ name: 'ValuationChart' });

/**
 * 指数估值曲线（IRs 决策区）
 *
 * 只负责画线，不做任何指标计算：序列来自 `/bds/index-valuations`（数据源属 bds），
 * 分位/中位数来自 `/bds/index-valuation-percentiles`。前端的唯一职责是
 * 「把 null 断开、按固定顺序取色」。
 */
interface Props {
  /** 交易日（升序字符串） */
  dates: string[];
  /** { 指数代码: 与 dates 对齐的数值数组（可含 null） } */
  series: Record<string, (number | null)[]>;
  /** { 指数代码: 名称 } */
  names: Record<string, string>;
  /** 需要展示的指数代码；空数组 = 全部 */
  visible: string[];
  /** Y 轴名称，如 'PE(TTM)' */
  metricLabel: string;
}

const props = defineProps<Props>();

// 按固定顺序取色：增减勾选时颜色不跳变
const COLORS = ['#5da8ff', '#26deca', '#fedc69', '#ff7d85', '#a78bfa', '#34d399'];

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
    valueFormatter: (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(2))
  },
  legend: {
    data: [] as string[],
    bottom: '2%',
    left: 'center',
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 12 }
  },
  grid: { left: '3%', right: '4%', bottom: '12%', top: '10%', containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: [] as string[] },
  yAxis: { type: 'value', name: props.metricLabel, scale: true, splitNumber: 5 },
  series: [] as never[]
}));

function refresh() {
  const codes = Object.keys(props.series || {});
  const show = props.visible.length ? props.visible.filter(c => codes.includes(c)) : codes;

  updateOptions(opts => {
    opts.xAxis.data = props.dates;
    opts.yAxis.name = props.metricLabel;
    opts.legend.data = show.map(c => props.names[c] || c);
    opts.series = show.map((code, i) => ({
      name: props.names[code] || code,
      type: 'line' as const,
      showSymbol: false,
      connectNulls: true,
      lineStyle: { width: 1.6 },
      itemStyle: { color: COLORS[i % COLORS.length] },
      data: (props.series[code] || []).map(v => (v == null ? null : Number(v)))
    })) as never;
    return opts;
  });
}

watch(() => [props.dates, props.series, props.visible, props.metricLabel], refresh, { deep: true, immediate: true });
</script>

<template>
  <div ref="domRef" class="h-420px w-full"></div>
</template>
