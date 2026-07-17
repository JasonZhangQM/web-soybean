<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'EarningsIvaChart' });

/**
 * 工业增加值、工业利润、PPI 同比合并图（双轴）：
 * 左轴(%)：工业增加值（蓝实线）、工业利润（紫实线，带 y=0 参考线）
 * 右轴(%)：PPI（橙虚线，工业品出厂价格，独立刻度）
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：三系列共用日期并集，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const ivaArr = getSeries(props.dataMap, 'CN_INDUSTRIAL_VALUE_ADDED_YOY');
  const profitArr = getSeries(props.dataMap, 'CN_INDUSTRIAL_PROFIT_YOY');
  const ppiArr = getSeries(props.dataMap, 'CN_PPI_YOY');

  // 收集三系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...ivaArr, ...profitArr, ...ppiArr].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['工业增加值同比', '工业利润同比', 'PPI 同比'] },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    // 双轴：左轴(工业增加值/工业利润) + 右轴(PPI 独立刻度)
    yAxis: [
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: splitColor } }
      },
      {
        type: 'value',
        name: 'PPI %',
        nameTextStyle: { color: '#d97706' },
        axisLabel: { color: '#d97706' },
        axisLine: { lineStyle: { color: '#d97706' } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '工业增加值同比',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(ivaArr)
      },
      {
        name: '工业利润同比',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true,
        // y=0 参考线：虚线灰色，区分正负增长
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 0 }]
        },
        data: buildValues(profitArr)
      },
      {
        name: 'PPI 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // PPI 采用虚线，与工业增加值/工业利润实线区分
        lineStyle: { color: '#d97706', width: 2, type: 'dashed' },
        itemStyle: { color: '#d97706' },
        connectNulls: true,
        data: buildValues(ppiArr)
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
