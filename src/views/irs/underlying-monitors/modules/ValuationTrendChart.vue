<script setup lang="ts">
/**
 * 标的监测抽屉「估值与走势对照」合并图（2026-11-14）
 *
 * 由原「估值数据」图与「累计收益率/回撤」图合并而来：一张图三轴对照——
 * 左轴估值指标原始值、右轴累计收益率(%)、右偏移轴回撤(%)。
 * 估值表与行情表的交易日集合未必一致（估值源可能有 NULL 行 / 缺日），
 * 这里做纯排版层面的日期并集对齐（缺失补 null 断线），不做任何数值计算，
 * 所有数值仍由 `GET /irs/um-market-stats` 后端算好。
 *
 * 任意指标切换都由父级整包重拉（performance 与 metric 无关、只随区间变），
 * 本组件只认 props：无估值序列时隐藏估值轴、仅画走势两条线，反之亦然。
 */
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';

defineOptions({ name: 'UnderlyingValuationTrendChart' });

interface Props {
  /** 估值指标名（左轴名 + 图例名），如 'PE(TTM)'；null = 无估值序列 */
  metricLabel: string | null;
  /** 估值交易日（升序），与 valValues 对齐；无估值传空数组 */
  valDates: string[];
  valValues: (number | null)[];
  /** 行情交易日（升序），与 cumReturn / drawdown 对齐；无行情传空数组 */
  perfDates: string[];
  cumReturn: (number | null)[];
  drawdown: (number | null)[];
}

const props = defineProps<Props>();

// 系列固定取色：估值蓝、收益率青、回撤绿（沿用合并前两张图的主色习惯）
const C_VAL = '#5da8ff';
const C_CUM = '#26deca';
const C_DD = '#3b9a4b';

/** 两列日期取并集（ISO 字符串字典序即时间序），各系列按 Map 补位、缺日填 null */
const merged = computed(() => {
  const valMap = new Map<string, number | null>();
  props.valDates.forEach((d, i) => valMap.set(d, props.valValues[i] ?? null));
  const cumMap = new Map<string, number | null>();
  const ddMap = new Map<string, number | null>();
  props.perfDates.forEach((d, i) => {
    cumMap.set(d, props.cumReturn[i] ?? null);
    ddMap.set(d, props.drawdown[i] ?? null);
  });
  const dates = Array.from(new Set([...props.valDates, ...props.perfDates])).sort();
  return {
    dates,
    val: dates.map(d => valMap.get(d) ?? null),
    cum: dates.map(d => cumMap.get(d) ?? null),
    dd: dates.map(d => ddMap.get(d) ?? null)
  };
});

/** 估值行可能全是 NULL（源表有行无值）——有点才画，无点隐藏估值轴 */
const hasVal = computed(() => props.valDates.length > 0 && props.valValues.some(v => v != null));
const hasPerf = computed(() => props.perfDates.length > 0);

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
  grid: { left: '3%', right: '12%', bottom: '12%', top: '12%', containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: [] as string[] },
  yAxis: [
    { type: 'value', name: '', show: true as boolean, scale: true, splitNumber: 5 },
    { type: 'value', name: '累计收益率(%)', scale: true, splitNumber: 5 },
    { type: 'value', name: '回撤(%)', max: 0, splitNumber: 4, offset: 56, splitLine: { show: false } }
  ],
  series: [] as never[]
}));

function refresh() {
  const { dates, val, cum, dd } = merged.value;
  const valName = props.metricLabel || '估值';

  updateOptions(opts => {
    opts.xAxis.data = dates;
    // 无估值序列时隐藏左轴，避免空轴占位误导判读
    opts.yAxis[0].show = hasVal.value;
    opts.yAxis[0].name = props.metricLabel ?? '';

    const legendData: string[] = [];
    const series: Record<string, unknown>[] = [];
    if (hasVal.value) {
      legendData.push(valName);
      series.push({
        name: valName,
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        connectNulls: true,
        lineStyle: { width: 1.6 },
        itemStyle: { color: C_VAL },
        data: val
      });
    }
    if (hasPerf.value) {
      legendData.push('累计收益率', '回撤');
      series.push({
        name: '累计收益率',
        type: 'line',
        yAxisIndex: 1,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1.8 },
        itemStyle: { color: C_CUM },
        data: cum
      });
      series.push({
        name: '回撤',
        type: 'line',
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.2 },
        itemStyle: { color: C_DD },
        data: dd
      });
    }
    opts.legend.data = legendData;
    opts.series = series as never;
    return opts;
  });
}

watch(
  () => [props.metricLabel, props.valDates, props.valValues, props.perfDates, props.cumReturn, props.drawdown],
  refresh,
  { deep: true, immediate: true }
);
</script>

<template>
  <div ref="domRef" class="h-420px w-full"></div>
</template>
