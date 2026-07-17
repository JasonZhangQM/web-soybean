<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'ExternalTradeChart' });

/**
 * 进出口同比走势合并图：
 * 出口-美元计（红）、出口-人民币计（蓝）、进口-美元计（绿）、进口-人民币计（橙）
 * 共用单轴(%)，无填充，y=0 参考线区分正负增长
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：四系列日期并集对齐，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const expUsd = getSeries(props.dataMap, 'CN_EXPORT_YOY_USD');
  const expCny = getSeries(props.dataMap, 'CN_EXPORT_YOY_CNY');
  const impUsd = getSeries(props.dataMap, 'CN_IMPORT_YOY_USD');
  const impCny = getSeries(props.dataMap, 'CN_IMPORT_YOY_CNY');

  // 收集四系列所有日期并去重排序
  const dateSet = new Set<string>();
  [expUsd, expCny, impUsd, impCny].forEach(arr => arr.forEach(x => dateSet.add(x.report_date)));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['出口-美元计', '出口-人民币计', '进口-美元计', '进口-人民币计'] },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    // 四系列共用单轴(%)
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
        name: '出口-美元计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        // y=0 参考线：虚线灰色，区分正负增长
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 0 }]
        },
        data: buildValues(expUsd)
      },
      {
        name: '出口-人民币计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(expCny)
      },
      {
        name: '进口-美元计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 进口采用虚线，与出口实线区分
        lineStyle: { color: '#16a34a', width: 2, type: 'dashed' },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: buildValues(impUsd)
      },
      {
        name: '进口-人民币计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 进口采用虚线，与出口实线区分
        lineStyle: { color: '#d97706', width: 2, type: 'dashed' },
        itemStyle: { color: '#d97706' },
        connectNulls: true,
        data: buildValues(impCny)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
