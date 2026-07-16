<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'ExternalExportChart' });

/** 出口同比：美元计 vs 人民币计，双折线对比（美元计填充） */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：对齐两系列日期并集，缺失日期填充 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const expUsd = getSeries(props.dataMap, 'CN_EXPORT_YOY_USD');
  const expCny = getSeries(props.dataMap, 'CN_EXPORT_YOY_CNY');

  // 合并两个序列的报告日期作为 x 轴（升序去重）
  const dateSet = new Set<string>();
  [...expUsd, ...expCny].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期该系列为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['美元计', '人民币计'] },
    grid: { left: 60, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '%',
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '美元计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: true,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        areaStyle: { color: 'rgba(220, 38, 38, 0.15)' },
        data: buildValues(expUsd)
      },
      {
        name: '人民币计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: true,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        data: buildValues(expCny)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 主题切换 / 数据变化时重建选项
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
