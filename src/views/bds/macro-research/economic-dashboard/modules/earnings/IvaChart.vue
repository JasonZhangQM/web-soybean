<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'EarningsIvaChart' });

interface Props {
  /** 工业增加值同比时序数据（按 report_date 升序） */
  data: Api.Bds.EconomicIndicator[];
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 暗色/亮色模式下的坐标轴颜色
function getThemeColors() {
  const dark = themeStore.darkMode;
  return {
    muted: dark ? '#9ca3af' : '#6b7280',
    rule: dark ? '#374151' : '#d1d5db'
  };
}

function buildOption() {
  const { muted, rule } = getThemeColors();
  const list = props.data ?? [];
  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: list.map(x => x.report_date),
      axisLabel: { color: muted },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '%',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        // 蓝色折线 + 浅蓝填充
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        areaStyle: { color: '#2563eb', opacity: 0.2 },
        data: list.map(x => Number(x.value))
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 数据变化时重建图表
watch(
  () => props.data,
  () => updateOptions(() => buildOption())
);

// 暗色模式切换时重建（更新轴线颜色）
watch(
  () => themeStore.darkMode,
  () => updateOptions(() => buildOption())
);
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
