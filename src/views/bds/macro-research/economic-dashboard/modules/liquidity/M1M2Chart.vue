<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcM1M2 } from '../utils';

defineOptions({ name: 'LiquidityM1M2Chart' });

/**
 * M1/M2 货币供应与剪刀差合并图：
 * M1 同比、M2 同比、M1-M2 剪刀差共用左轴(%)，剪刀差带紫色面积 + y=0 参考线
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

  const m1Arr = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2Arr = getSeries(props.dataMap, 'CN_M2_YOY');
  // 剪刀差已按 report_date 对齐 M1、M2
  const scissors = calcM1M2(m1Arr, m2Arr);

  // 收集三个系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...m1Arr, ...m2Arr].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };
  // 剪刀差按其自身日期对齐到 dates
  const scissorsMap = new Map(scissors.map(x => [x.report_date, x.value]));
  const scissorsValues = dates.map(d => (scissorsMap.has(d) ? (scissorsMap.get(d) as number) : null));

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['M1 同比', 'M2 同比', 'M1-M2 剪刀差'] },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    // 三系列共用单轴(%)
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
        name: 'M1 同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(m1Arr)
      },
      {
        name: 'M2 同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(m2Arr)
      },
      {
        name: 'M1-M2 剪刀差',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 3 },
        itemStyle: { color: '#7c3aed' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(124, 58, 237, 0.35)' },
              { offset: 1, color: 'rgba(124, 58, 237, 0.02)' }
            ]
          }
        },
        // y=0 参考线：虚线灰色，用于区分资金活化 / 沉淀
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 0 }]
        },
        data: scissorsValues
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
