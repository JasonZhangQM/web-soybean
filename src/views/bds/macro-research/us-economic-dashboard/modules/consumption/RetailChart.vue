<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'ConsumptionRetailChart' });

/**
 * 零售销售环比（柱状图，正负值不同颜色）
 * ≥0 蓝 #3b82f670，<0 红 #dc262670
 * 用 ECharts itemStyle.color 回调函数实现动态着色
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

// 构建 ECharts 配置：零售销售环比柱状图，按值正负动态着色
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const arr = getSeries(props.dataMap, 'RETAIL_SALES_MOM');
  const dates = arr.map(x => x.report_date.slice(0, 10));
  const values = arr.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)}%`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['零售销售环比']
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
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '零售销售环比',
        type: 'bar',
        barMaxWidth: 24,
        // 按值正负动态着色：≥0 蓝，<0 红
        itemStyle: {
          color: (params: any) => (Number(params.value) >= 0 ? '#3b82f670' : '#dc262670')
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
