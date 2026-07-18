<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, normalize } from '../utils';

defineOptions({ name: 'ConsumptionComboChart' });

/**
 * 需求侧指标综合（跨双列，高 320px）
 * 三条折线（标准化到 0-100 后对比）：
 *   1. 零售销售（蓝 #3b82f6）
 *   2. 耐用品订单（紫 #7c3aed）
 *   3. 成屋销售（青 #14b8a6）
 * 三指标日期可能不同，以零售销售日期为主轴，其他按 report_date 对齐
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

// 将某指标的值标准化到 0-100，并按 report_date 建立映射，便于按主轴日期对齐
function buildNormalizedMap(arr: Api.Bds.EconomicIndicator[]): Map<string, number> {
  const values = arr.map(x => Number(x.value));
  const normalized = normalize(values);
  return new Map(arr.map((x, i) => [x.report_date, normalized[i]]));
}

// 构建 ECharts 配置：三大需求侧指标标准化后对比
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const retailArr = getSeries(props.dataMap, 'RETAIL_SALES_MOM');
  const durableArr = getSeries(props.dataMap, 'DURABLE_GOODS_ORDERS_MOM');
  const houseArr = getSeries(props.dataMap, 'EXISTING_HOME_SALES');

  // 各指标标准化后的「日期 -> 标准化值」映射
  const retailMap = buildNormalizedMap(retailArr);
  const durableMap = buildNormalizedMap(durableArr);
  const houseMap = buildNormalizedMap(houseArr);

  // 以零售销售日期为主轴，其他按 report_date 对齐，缺失记为 null
  const dates = retailArr.map(x => x.report_date.slice(0, 10));
  const retailValues = retailArr.map(x => retailMap.get(x.report_date) ?? null);
  const durableValues = retailArr.map(x => durableMap.get(x.report_date) ?? null);
  const houseValues = retailArr.map(x => houseMap.get(x.report_date) ?? null);

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(1))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['零售销售', '耐用品订单', '成屋销售']
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
      name: '标准化 0-100',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '零售销售',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        data: retailValues
      },
      {
        name: '耐用品订单',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        data: durableValues
      },
      {
        name: '成屋销售',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' },
        data: houseValues
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
