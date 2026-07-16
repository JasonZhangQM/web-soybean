<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'LiquidityComboChart' });

/** 流动性综合视图（双轴，跨双列，高 320px）
 *  左轴（万亿元）：社融增量柱状 红
 *  右轴（%）：M2 同比折线 蓝 + LPR 1Y 折线 琥珀虚线
 *  xAxis 以社融日期为主 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：双轴混合图，社融日期为 x 轴基准 */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const sf = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');
  const lpr1y = getSeries(props.dataMap, 'CN_LPR_1Y');

  // 以社融日期为主 x 轴
  const dates = sf.map(x => x.report_date);

  // 社融：直接按顺序取值
  const sfValues = sf.map(x => Number(x.value));

  // M2 / LPR：按 report_date 对齐到社融日期，缺失为 null
  const buildAlignedValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['社融增量', 'M2 同比', '1Y LPR'] },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '万亿元',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: splitColor } }
      },
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '社融增量',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: '#dc2626' },
        data: sfValues
      },
      {
        name: 'M2 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildAlignedValues(m2)
      },
      {
        name: '1Y LPR',
        type: 'line',
        yAxisIndex: 1,
        step: 'middle',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#d97706', width: 2, type: 'dashed' },
        itemStyle: { color: '#d97706' },
        connectNulls: true,
        data: buildAlignedValues(lpr1y)
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
