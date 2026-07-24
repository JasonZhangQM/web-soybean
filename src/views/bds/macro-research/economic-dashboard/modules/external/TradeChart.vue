<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'ExternalTradeChart' });

/**
 * 进出口走势与贸易顺差合并图（双轴）：
 * 左轴折线(%)：出口红色、进口绿色
 * 右轴柱状(亿美元)：贸易顺差紫色，y=0 参考线区分正负
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：三系列日期并集对齐，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const expUsd = getSeries(props.dataMap, 'CN_EXPORT_YOY_USD');
  const impUsd = getSeries(props.dataMap, 'CN_IMPORT_YOY_USD');
  const tradeBalance = getSeries(props.dataMap, 'CN_TRADE_BALANCE_USD');

  // 收集三系列所有日期并去重排序
  const dateSet = new Set<string>();
  [expUsd, impUsd, tradeBalance].forEach(arr => arr.forEach(x => dateSet.add(x.report_date)));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['出口-美元计', '进口-美元计', '贸易顺差'] },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    // 左轴：进出口同比(%)
    yAxis: [
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: splitColor } }
      },
      // 右轴：贸易顺差(亿美元)
      {
        type: 'value',
        name: '亿美元',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '出口-美元计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        yAxisIndex: 0,
        // 出口红色实线
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(expUsd)
      },
      {
        name: '进口-美元计',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        yAxisIndex: 0,
        // 进口绿色实线
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: buildValues(impUsd)
      },
      {
        name: '贸易顺差',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 紫色虚线
        lineStyle: { color: '#7c3aed', width: 2, type: 'dashed' },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true,
        // 浅紫渐变填充
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
        // y=0 参考线：虚线灰色，区分顺差正负
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 0 }]
        },
        data: buildValues(tradeBalance)
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
