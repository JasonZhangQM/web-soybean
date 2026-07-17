<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'LiquidityLprChart' });

/** LPR 阶梯式折线图：1Y 红 / 5Y 蓝，step='middle' */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：对齐两系列日期并集，阶梯式折线 */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const lpr1y = getSeries(props.dataMap, 'CN_LPR_1Y');
  const lpr5y = getSeries(props.dataMap, 'CN_LPR_5Y');

  // 收集两系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...lpr1y, ...lpr5y].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  // 根据实际数据范围计算 Y 轴 min/max，留少量边距避免折线贴边
  const allValues = [...buildValues(lpr1y), ...buildValues(lpr5y)].filter((v): v is number => v != null);
  const dataMin = allValues.length ? Math.min(...allValues) : 0;
  const dataMax = allValues.length ? Math.max(...allValues) : 1;
  const padding = (dataMax - dataMin) * 0.15 || 0.5;

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['1Y LPR', '5Y LPR'] },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
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
      min: Math.floor((dataMin - padding) * 10) / 10,
      max: Math.ceil((dataMax + padding) * 10) / 10,
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '1Y LPR',
        type: 'line',
        step: 'middle',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(lpr1y)
      },
      {
        name: '5Y LPR',
        type: 'line',
        step: 'middle',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(lpr5y)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
