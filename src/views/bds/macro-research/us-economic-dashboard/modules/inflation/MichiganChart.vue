<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'InflationMichiganChart' });

/**
 * 密歇根通胀预期 双折线
 * 5 年预期（蓝）+ 1 年预期（橙）
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 根据暗色模式返回对应的文字/线条颜色
function getThemeColors() {
  const dark = themeStore.darkMode;
  return {
    ink: dark ? '#e0e0e0' : '#1a1a2e',
    muted: dark ? '#9ca3af' : '#6b7280',
    rule: dark ? '#374151' : '#d1d5db'
  };
}

// 构建 ECharts 配置：5 年 + 1 年通胀预期双折线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const fiveYearArr = getSeries(props.dataMap, 'MICHIGAN_5Y_INFLATION_EXPECTATION');
  const oneYearArr = getSeries(props.dataMap, 'MICHIGAN_1Y_INFLATION_EXPECTATION');

  // 以 5 年预期日期为主轴，按 report_date 对齐 1 年预期
  const oneYearMap = new Map(oneYearArr.map(x => [x.report_date, Number(x.value)]));
  const dates = fiveYearArr.map(x => x.report_date.slice(0, 7));
  const fiveYearValues = fiveYearArr.map(x => Number(x.value));
  const oneYearValues = fiveYearArr.map(x => {
    const v = oneYearMap.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['5年通胀预期', '1年通胀预期']
    },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '%',
      scale: true,
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '5年通胀预期',
        type: 'line',
        data: fiveYearValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: '1年通胀预期',
        type: 'line',
        data: oneYearValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316' }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换 & 数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-260px w-full"></div>
</template>
