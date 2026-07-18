<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'InflationPpiChart' });

/**
 * PPI 同比 单折线（填充）
 * PPI 同比（琥珀色，浅色填充）
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

// 构建 ECharts 配置：PPI 同比单折线 + 区域填充
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const ppiArr = getSeries(props.dataMap, 'PPI_YOY');

  const dates = ppiArr.map(x => x.report_date.slice(0, 7));
  const ppiValues = ppiArr.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['PPI同比']
    },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
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
      {
        name: 'PPI同比',
        type: 'line',
        data: ppiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#d97706', width: 2 },
        itemStyle: { color: '#d97706' },
        // 区域填充：琥珀色低透明度
        areaStyle: { color: '#d9770615' }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换 & 数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-260px w-full"></div>
</template>
