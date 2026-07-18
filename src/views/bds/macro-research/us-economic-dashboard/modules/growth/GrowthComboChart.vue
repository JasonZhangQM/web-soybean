<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, normalize } from '../utils';

defineOptions({ name: 'GrowthComboChart' });

/**
 * 经济增长综合视图（双轴，跨双列，高 320px）
 * GDP 季环比柱状（左轴）+ 零售销售标准化折线（右轴）+ 耐用品订单标准化折线（右轴）
 * 零售/耐用品先经 normalize() 标准化到 0-100，以 GDP 日期为主轴按 report_date 精确匹配对齐
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

// 构建 ECharts 配置：GDP 柱状（左轴）+ 零售/耐用品标准化折线（右轴）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const gdpArr = getSeries(props.dataMap, 'GDP_QOQ');
  const retailArr = getSeries(props.dataMap, 'RETAIL_SALES_MOM');
  const durableArr = getSeries(props.dataMap, 'DURABLE_GOODS_ORDERS_MOM');

  // 以 GDP 日期为主轴
  const dates = gdpArr.map(x => x.report_date.slice(0, 10));
  const gdpValues = gdpArr.map(x => Number(x.value));

  // 零售/耐用品先对完整时序标准化到 0-100，再按 report_date 精确匹配 GDP 日期
  const buildNormalizedMap = (arr: Api.Bds.EconomicIndicator[]) => {
    const normalized = normalize(arr.map(x => Number(x.value)));
    return new Map(arr.map((x, i) => [x.report_date, normalized[i]]));
  };
  const retailMap = buildNormalizedMap(retailArr);
  const durableMap = buildNormalizedMap(durableArr);

  // 按 GDP 日期对齐，缺失日期为 null
  const retailValues = gdpArr.map(x => {
    const v = retailMap.get(x.report_date);
    return v == null ? null : v;
  });
  const durableValues = gdpArr.map(x => {
    const v = durableMap.get(x.report_date);
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
      data: ['GDP季环比', '零售销售(标准化)', '耐用品订单(标准化)']
    },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    // 双轴：左轴 GDP(%) + 右轴标准化值(0-100)
    yAxis: [
      {
        type: 'value',
        name: 'GDP %',
        nameTextStyle: { color: '#3b82f6' },
        axisLabel: { color: '#3b82f6', fontSize: 11, formatter: '{value}%' },
        axisLine: { lineStyle: { color: '#3b82f6' } },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '标准化值',
        nameTextStyle: { color: muted },
        axisLabel: { color: muted, fontSize: 11 },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false },
        min: 0,
        max: 100
      }
    ],
    series: [
      {
        name: 'GDP季环比',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 24,
        itemStyle: { color: '#3b82f6' },
        data: gdpValues
      },
      {
        name: '零售销售(标准化)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: retailValues
      },
      {
        name: '耐用品订单(标准化)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#d97706', width: 2 },
        itemStyle: { color: '#d97706' },
        connectNulls: true,
        data: durableValues
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
  <div ref="domRef" class="h-320px w-full"></div>
</template>
