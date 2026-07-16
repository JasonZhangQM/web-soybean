<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'SfVsM2Chart' });

/**
 * 社融增量 vs M2 同比（双轴图）
 * 左轴：社融增量（柱状，红色，单位万亿元）
 * 右轴：M2 同比（折线，蓝色，单位 %）
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

// 构建 ECharts 配置：社融增量柱状（左轴万亿） + M2 同比折线（右轴 %）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const sfArr = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const m2Arr = getSeries(props.dataMap, 'CN_M2_YOY');

  // 以社融增量日期为主轴，按 report_date 对齐 M2
  const m2Map = new Map(m2Arr.map(x => [x.report_date, Number(x.value)]));
  const dates = sfArr.map(x => x.report_date.slice(0, 7)); // YYYY-MM
  const sfValues = sfArr.map(x => Number(x.value));
  const m2Values = sfArr.map(x => {
    const v = m2Map.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'cross' },
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['社融增量(万亿元)', 'M2同比(%)']
    },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: [
      {
        type: 'value',
        name: '万亿元',
        nameTextStyle: { color: muted, fontSize: 11 },
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: muted, fontSize: 11 },
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '社融增量(万亿元)',
        type: 'bar',
        data: sfValues,
        itemStyle: { color: '#dc2626' },
        barMaxWidth: 24
      },
      {
        name: 'M2同比(%)',
        type: 'line',
        yAxisIndex: 1,
        data: m2Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时刷新文字颜色（自定义颜色需手动重建）
watch(() => themeStore.darkMode, () => {
  updateOptions(() => buildOption());
});
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
