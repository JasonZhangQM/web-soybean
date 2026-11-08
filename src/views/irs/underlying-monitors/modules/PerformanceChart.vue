<script setup lang="ts">
/**
 * 标的监测抽屉「累计收益率 / 回撤」双轴图（2026-11-08）
 *
 * 纯 props 驱动，与 `ValuationChart.vue` 同一套写法：只画线，不算数。
 * 左轴累计收益率（%），右轴当日回撤（%，≤0），数值全部来自
 * `GET /irs/um-market-stats` 的后端计算（bds/market_data/cum_return.py）。
 */
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';

defineOptions({ name: 'UnderlyingPerformanceChart' });

interface Props {
  /** 交易日（升序） */
  dates: string[];
  /** 累计收益率(%)，与 dates 对齐 */
  cumReturn: (number | null)[];
  /** 当日回撤(%)，≤0，与 dates 对齐 */
  drawdown: (number | null)[];
}

const props = defineProps<Props>();

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
    valueFormatter: (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(2))
  },
  legend: {
    data: ['累计收益率', '回撤'],
    bottom: '2%',
    left: 'center',
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 12 }
  },
  grid: { left: '3%', right: '4%', bottom: '12%', top: '12%', containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: [] as string[] },
  yAxis: [
    { type: 'value', name: '累计收益率(%)', scale: true, splitNumber: 5 },
    { type: 'value', name: '回撤(%)', max: 0, splitNumber: 5, splitLine: { show: false } }
  ],
  series: [] as never[]
}));

function refresh() {
  updateOptions(opts => {
    opts.xAxis.data = props.dates;
    opts.series = [
      {
        name: '累计收益率',
        type: 'line' as const,
        yAxisIndex: 0,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1.8 },
        itemStyle: { color: '#5da8ff' },
        data: props.cumReturn
      },
      {
        name: '回撤',
        type: 'line' as const,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.2 },
        itemStyle: { color: '#3b9a4b' },
        data: props.drawdown
      }
    ] as never;
    return opts;
  });
}

watch(() => [props.dates, props.cumReturn, props.drawdown], refresh, { deep: true, immediate: true });
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
