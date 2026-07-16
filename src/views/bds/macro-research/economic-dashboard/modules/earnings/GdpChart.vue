<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'EarningsGdpChart' });

interface Props {
  /** GDP 同比时序数据（按 report_date 升序） */
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

// 按值着色：>=2 红，>=0 琥珀，<0 绿
function valueColor(v: number) {
  if (v >= 2) return '#dc2626';
  if (v >= 0) return '#d97706';
  return '#16a34a';
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
        type: 'bar',
        // 动态着色：按值映射红/琥珀/绿
        data: list.map(x => ({
          value: Number(x.value),
          itemStyle: { color: valueColor(Number(x.value)) }
        }))
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
