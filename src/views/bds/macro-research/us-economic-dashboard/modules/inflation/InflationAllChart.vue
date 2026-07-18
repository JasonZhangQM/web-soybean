<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'InflationAllChart' });

/**
 * 通胀指标全景对比（跨双列，高 320px）
 * 7 条折线叠加，以 CPI_YOY 日期为主轴，其他指标按 report_date 对齐
 * PCE 环比与核心 PCE 环比乘以 12 年化后对比，并以虚线区分
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 根据暗色模式返回对应的文字/线条颜色
function getThemeColors() {
  const dark = themeStore.darkMode;
  return {
    ink: dark ? '#e0e0e0' : '#1a1a2e',
    muted: dark ? '#9ca3af' : '#6b7280',
    rule: dark ? '#374151' : '#d1d5db'
  };
}

/**
 * 按 CPI_YOY 主轴日期对齐目标序列，缺失日期填充 null
 * @param multiplier 年化倍数（环比转年化用 12，同比用 1）
 */
function alignByCpiDates(
  targetArr: Api.Bds.EconomicIndicator[],
  cpiDates: string[],
  multiplier = 1
): (number | null)[] {
  const map = new Map(targetArr.map(x => [x.report_date, Number(x.value) * multiplier]));
  return cpiDates.map(d => {
    const v = map.get(d);
    return v == null ? null : v;
  });
}

// 构建 ECharts 配置：7 条折线叠加全景
function buildOption() {
  const { ink, muted, rule } = getThemeColors();

  // 以 CPI 同比日期为主轴
  const cpiArr = getSeries(props.dataMap, 'CPI_YOY');
  const cpiDates = cpiArr.map(x => x.report_date);
  const dates = cpiArr.map(x => x.report_date.slice(0, 7));

  // 各系列按主轴日期对齐
  const coreCpiArr = getSeries(props.dataMap, 'CORE_CPI_YOY');
  const pceArr = getSeries(props.dataMap, 'PCE_YOY');
  const corePceArr = getSeries(props.dataMap, 'CORE_PCE_YOY');
  const ppiArr = getSeries(props.dataMap, 'PPI_YOY');
  const pceMomArr = getSeries(props.dataMap, 'PCE_MOM');
  const corePceMomArr = getSeries(props.dataMap, 'CORE_PCE_MOM');

  // 构建单条折线 series 配置（默认实线）
  const buildLineSeries = (
    name: string,
    values: (number | null)[],
    color: string,
    dashed = false
  ) => ({
    name,
    type: 'line',
    data: values,
    smooth: true,
    symbol: 'circle',
    symbolSize: 4,
    connectNulls: true,
    lineStyle: { color, width: 2, ...(dashed ? { type: 'dashed' as const } : {}) },
    itemStyle: { color }
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['CPI同比', '核心CPI同比', 'PCE同比', '核心PCE同比', 'PPI同比', 'PCE环比×12', '核心PCE环比×12']
    },
    grid: { left: 50, right: 30, top: 30, bottom: 50 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '%',
      scale: true,
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      buildLineSeries('CPI同比', cpiArr.map(x => Number(x.value)), '#dc2626'),
      buildLineSeries('核心CPI同比', alignByCpiDates(coreCpiArr, cpiDates), '#f59e0b'),
      buildLineSeries('PCE同比', alignByCpiDates(pceArr, cpiDates), '#7c3aed'),
      buildLineSeries('核心PCE同比', alignByCpiDates(corePceArr, cpiDates), '#6366f1'),
      buildLineSeries('PPI同比', alignByCpiDates(ppiArr, cpiDates), '#d97706'),
      // PCE 环比 × 12 年化，虚线区分
      buildLineSeries('PCE环比×12', alignByCpiDates(pceMomArr, cpiDates, 12), '#14b8a6', true),
      buildLineSeries('核心PCE环比×12', alignByCpiDates(corePceMomArr, cpiDates, 12), '#06b6a4', true)
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换 & 数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
