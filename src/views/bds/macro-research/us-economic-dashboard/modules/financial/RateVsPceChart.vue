<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, alignAsOf } from '../utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'RateVsPceChart' });

/**
 * 利率 vs 核心 PCE 综合图（跨双列双轴）
 * 左轴：利率上限（红） + 利率下限（蓝）双折线
 * 右轴：核心 PCE 同比（绿）折线
 *
 * 数据对齐：
 * - 利率上下限同为 per_fomc 频率，按 report_date 精确匹配
 * - 核心 PCE 为 monthly 频率，与利率频率不同，用 alignAsOf 取 <= 利率日期的最近一条
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

// 最新值表格行：利率与 PCE 单位均为 %
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'FED_FUNDS_RATE_UPPER', name: '利率上限', color: '#dc2626', unit: '%' },
    { code: 'FED_FUNDS_RATE', name: '利率下限', color: '#2563eb', unit: '%' },
    { code: 'CORE_PCE_YOY', name: '核心PCE同比', color: '#16a34a', unit: '%' }
  ])
);

// 构建 ECharts 配置：利率上下限（左轴）+ 核心 PCE 同比（右轴）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const lowerArr = getSeries(props.dataMap, 'FED_FUNDS_RATE');
  const upperArr = getSeries(props.dataMap, 'FED_FUNDS_RATE_UPPER');
  const pceArr = getSeries(props.dataMap, 'CORE_PCE_YOY');

  // 利率上下限同为 per_fomc 频率，按 report_date 精确匹配
  const upperMap = new Map(upperArr.map(x => [x.report_date, Number(x.value)]));
  const dates = lowerArr.map(x => x.report_date.slice(0, 10));
  const lowerValues = lowerArr.map(x => Number(x.value));
  const upperValues = lowerArr.map(x => {
    const v = upperMap.get(x.report_date);
    return v == null ? null : v;
  });
  // 核心 PCE 为 monthly 频率，与利率频率不同，用 as-of join 取 <= 利率日期的最近一条
  const pceValues = alignAsOf(
    lowerArr.map(x => x.report_date),
    pceArr
  );

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 保留 2 位小数
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['利率上限', '利率下限', '核心PCE同比']
    },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    // 双轴：左轴利率(%) + 右轴核心 PCE(%)
    yAxis: [
      {
        type: 'value',
        name: '利率 %',
        nameTextStyle: { color: muted, fontSize: 11 },
        scale: true,
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '核心PCE %',
        nameTextStyle: { color: '#16a34a', fontSize: 11 },
        scale: true,
        axisLabel: { color: '#16a34a', fontSize: 11, formatter: '{value}%' },
        axisLine: { lineStyle: { color: '#16a34a' } },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false }
      }
    ],
    series: [
      // 1. 利率上限（左轴，红色折线）
      {
        name: '利率上限',
        type: 'line',
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: upperValues
      },
      // 2. 利率下限（左轴，蓝色折线）
      {
        name: '利率下限',
        type: 'line',
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: lowerValues
      },
      // 3. 核心 PCE 同比（右轴，绿色折线）
      {
        name: '核心PCE同比',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: pceValues
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换或数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div class="relative">
    <div ref="domRef" class="h-360px w-full"></div>
    <LatestTable :rows="latestRows" :left="66" />
  </div>
</template>
