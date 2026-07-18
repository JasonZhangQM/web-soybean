<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'GrowthGdpChart' });

/**
 * GDP 季环比柱状图（按值三色着色）
 * value ≥ 2 蓝（高于潜在增速），0 ≤ value < 2 琥珀（温和增长），value < 0 红（负增长）
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

// 构建 ECharts 配置：单柱状图，按 GDP 增速区间三色着色
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const arr = getSeries(props.dataMap, 'GDP_QOQ');
  const dates = arr.map(x => x.report_date.slice(0, 10));
  const values = arr.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['GDP季环比']
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
      axisLabel: { color: muted, fontSize: 11 },
      scale: true,
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: 'GDP季环比',
        type: 'bar',
        barMaxWidth: 24,
        // 三色着色：≥2 蓝（高于潜在增速），0~2 琥珀（温和增长），<0 红（负增长）
        itemStyle: {
          color: (params: { value: number }) => {
            const v = Number(params.value);
            if (v >= 2) return '#3b82f670';
            if (v >= 0) return '#f59e0b70';
            return '#dc262670';
          }
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
