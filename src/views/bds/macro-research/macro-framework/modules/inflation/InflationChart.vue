<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcScissors } from '../../../_shared/utils';

defineOptions({ name: 'InflationInflationChart' });

/**
 * 通胀走势图：CPI 同比 / PPI 同比 / CPI-PPI 剪刀差
 * 三条折线共用单轴(%)，剪刀差用 calcScissors 计算（独立系列，日期与 CPI/PPI 不完全对齐）
 * 剪刀差带 y=0 参考线，用于区分上下游受益
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：三系列共用日期并集，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  // 亮色 #6b7280 / 暗色 #9ca3af
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  // 亮色 #d1d5db / 暗色 #374151
  const splitColor = dark ? '#374151' : '#d1d5db';

  const cpiArr = getSeries(props.dataMap, 'CN_CPI_YOY');
  const ppiArr = getSeries(props.dataMap, 'CN_PPI_YOY');
  // 剪刀差：CPI 同比 - PPI 同比，按 report_date 对齐
  const scissors = calcScissors(cpiArr, ppiArr);

  // 收集三系列所有日期并去重排序（剪刀差作为独立系列参与对齐）
  const dateSet = new Set<string>();
  [...cpiArr, ...ppiArr, ...scissors].forEach(x => dateSet.add(x.report_date));
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
    legend: { bottom: 0, data: ['CPI 同比', 'PPI 同比', 'CPI-PPI 剪刀差'] },
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
        name: 'CPI 同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(cpiArr)
      },
      {
        name: 'PPI 同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(ppiArr)
      },
      {
        name: 'CPI-PPI 剪刀差',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 剪刀差用虚线，突出上下游博弈信号
        lineStyle: { color: '#ea580c', width: 2, type: 'dashed' },
        itemStyle: { color: '#ea580c' },
        connectNulls: true,
        // 浅橙渐变填充：顶部 25% 透明度到底部接近透明
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(234, 88, 12, 0.25)' },
              { offset: 1, color: 'rgba(234, 88, 12, 0.02)' }
            ]
          }
        },
        // y=0 参考线：虚线灰色，区分上下游受益
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

// 暗色模式切换时重建配置以刷新坐标轴颜色
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
// 数据变更时刷新图表
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
