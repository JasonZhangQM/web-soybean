<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'LiquidityComboChart' });

/** 流动性综合视图（双轴，跨双列，高 320px）
 *  左轴（亿元）：社融增量柱状 红 + 新增贷款柱状 蓝（重叠半透明）
 *  右轴（%）：M2 同比折线 紫
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
  const loan = getSeries(props.dataMap, 'CN_NEW_RMB_LOANS_CUM');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');

  // 收集三个系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...sf, ...loan, ...m2].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['社融增量', '新增贷款', 'M2 同比'] },
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
        name: '亿元',
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
        itemStyle: { color: 'rgba(220, 38, 38, 0.65)' },
        barGap: '-100%',
        data: buildValues(sf)
      },
      {
        name: '新增贷款',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(37, 99, 235, 0.65)' },
        barGap: '-100%',
        data: buildValues(loan)
      },
      {
        name: 'M2 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true,
        data: buildValues(m2)
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
