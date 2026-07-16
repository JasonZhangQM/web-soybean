<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'EarningsAllChart' });

interface Props {
  /** 全部指标 Map（indicator_code -> 时序数组，升序） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
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

// 4 条折线的指标代码、名称、颜色配置
const SERIES_CONFIG = [
  { code: 'CN_INDUSTRIAL_VALUE_ADDED_YOY', name: '工业增加值', color: '#2563eb' },
  { code: 'CN_INDUSTRIAL_PROFIT_YOY', name: '工业利润', color: '#7c3aed' },
  { code: 'CN_CPI_YOY', name: 'CPI', color: '#16a34a' },
  { code: 'CN_PPI_YOY', name: 'PPI', color: '#d97706' }
] as const;

function buildOption() {
  const { muted, rule } = getThemeColors();
  const map = props.dataMap ?? new Map<string, Api.Bds.EconomicIndicator[]>();

  // 各系列 (report_date -> value) 映射
  const seriesMaps = SERIES_CONFIG.map(cfg => {
    const list = map.get(cfg.code) ?? [];
    return new Map(list.map(x => [x.report_date, Number(x.value)]));
  });

  // 所有 report_date 的并集，升序排列
  const dateSet = new Set<string>();
  seriesMaps.forEach(m => m.forEach((_, date) => dateSet.add(date)));
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // 构造 4 条折线数据，缺失日期为 null（不显示该点）
  const series = SERIES_CONFIG.map((cfg, idx) => {
    const m = seriesMaps[idx];
    return {
      name: cfg.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: cfg.color, width: 2 },
      itemStyle: { color: cfg.color },
      data: dates.map(d => (m.has(d) ? m.get(d) : null))
    };
  });

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: SERIES_CONFIG.map(c => c.name) },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
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
    series
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 数据变化时重建图表
watch(
  () => props.dataMap,
  () => updateOptions(() => buildOption())
);

// 暗色模式切换时重建（更新轴线颜色）
watch(
  () => themeStore.darkMode,
  () => updateOptions(() => buildOption())
);
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
