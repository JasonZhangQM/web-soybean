<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'GrowthBudgetChart' });

/**
 * 政府预算柱状图（正负值不同颜色）
 * value ≥ 0 蓝（盈余），< 0 橙（赤字）
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

// 构建 ECharts 配置：单柱状图，按 value 正负着色
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const arr = getSeries(props.dataMap, 'GOVERNMENT_BUDGET');
  const dates = arr.map(x => x.report_date.slice(0, 10));
  const values = arr.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} 亿美元`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['政府预算']
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
      name: '亿美元',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      scale: true,
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '政府预算',
        type: 'bar',
        barMaxWidth: 24,
        // 正负值不同颜色：≥0 蓝（盈余），<0 橙（赤字）
        itemStyle: {
          color: (params: { value: number }) => (Number(params.value) >= 0 ? '#3b82f670' : '#f9731670')
        },
        data: values
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换或数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-260px w-full"></div>
</template>
