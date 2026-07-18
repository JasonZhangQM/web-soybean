<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'InflationTrendChart' });

/**
 * 通胀趋势全景图
 * CPI 同比（红） + 核心CPI 同比（橙） + PPI 同比（琥珀）三折线
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

// 构建 ECharts 配置：CPI + 核心CPI + PPI 三折线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const cpiArr = getSeries(props.dataMap, 'CPI_YOY');
  const coreCpiArr = getSeries(props.dataMap, 'CORE_CPI_YOY');
  const ppiArr = getSeries(props.dataMap, 'PPI_YOY');

  // 以 CPI 日期为主轴，按 report_date 对齐核心CPI与PPI
  const coreCpiMap = new Map(coreCpiArr.map(x => [x.report_date, Number(x.value)]));
  const ppiMap = new Map(ppiArr.map(x => [x.report_date, Number(x.value)]));
  const dates = cpiArr.map(x => x.report_date.slice(0, 7));
  const cpiValues = cpiArr.map(x => Number(x.value));
  const coreCpiValues = cpiArr.map(x => {
    const v = coreCpiMap.get(x.report_date);
    return v == null ? null : v;
  });
  const ppiValues = cpiArr.map(x => {
    const v = ppiMap.get(x.report_date);
    return v == null ? null : v;
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
      data: ['CPI同比', '核心CPI同比', 'PPI同比']
    },
    grid: { left: 50, right: 50, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: 'CPI同比',
        type: 'line',
        data: cpiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' }
      },
      {
        name: '核心CPI同比',
        type: 'line',
        data: coreCpiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' }
      },
      {
        name: 'PPI同比',
        type: 'line',
        data: ppiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#d97706', width: 2 },
        itemStyle: { color: '#d97706' }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时刷新文字颜色
watch(() => themeStore.darkMode, () => {
  updateOptions(() => buildOption());
});
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
