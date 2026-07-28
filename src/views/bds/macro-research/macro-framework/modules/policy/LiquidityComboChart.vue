<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcM1M2 } from '../../../_shared/utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'LiquidityComboChart' });

/** 流动性综合视图（双轴）
 *  左轴（亿元）：社融增量柱状 红 + 新增贷款柱状 蓝（重叠半透明）
 *  右轴（%）：M1 同比折线 蓝、M2 同比折线 红、M1-M2 剪刀差紫色面积 + y=0 参考线
 *  xAxis 为所有系列日期并集 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 最新值表格行：社融/贷款单位 亿元，M1/M2/剪刀差单位 %
// 剪刀差为 calcM1M2 计算值，需单独从计算结果取最新
const latestRows = computed(() => {
  const rows = buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'CN_SOCIAL_FINANCING_CUM', name: '社融增量累计', color: '#dc2626', unit: '亿元' },
    { code: 'CN_NEW_RMB_LOANS_CUM', name: '新增贷款累计', color: '#2563eb', unit: '亿元' },
    { code: 'CN_M1_YOY', name: 'M1同比', color: '#2563eb', unit: '%' },
    { code: 'CN_M2_YOY', name: 'M2同比', color: '#dc2626', unit: '%' }
  ]);
  // M1-M2 剪刀差最新值：从 calcM1M2 计算结果取最后一条非 null
  const scissors = calcM1M2(
    getSeries(props.dataMap, 'CN_M1_YOY'),
    getSeries(props.dataMap, 'CN_M2_YOY')
  ).filter(x => x.value != null);
  const latestScissors = scissors.length > 0 ? scissors[scissors.length - 1] : null;
  rows.push({
    name: 'M1-M2剪刀差',
    color: '#7c3aed',
    value: latestScissors ? Number(latestScissors.value).toFixed(2) + ' %' : '--',
    date: latestScissors ? latestScissors.report_date.slice(0, 10) : '--'
  });
  return rows;
});

/** 构建 ECharts 配置：双轴混合图，日期并集对齐 */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const sf = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const loan = getSeries(props.dataMap, 'CN_NEW_RMB_LOANS_CUM');
  const m1 = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');
  // 剪刀差按 M1、M2 日期计算后对齐到 dates
  const scissors = calcM1M2(m1, m2);

  // 收集所有系列日期并去重排序
  const dateSet = new Set<string>();
  [...sf, ...loan, ...m1, ...m2].forEach(x => dateSet.add(x.report_date));
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
    legend: { bottom: 0, data: ['社融增量累计', '新增贷款累计', 'M1 同比', 'M2 同比', 'M1-M2 剪刀差'] },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
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
      // 左轴：社融增量累计柱状（红半透明）
      {
        name: '社融增量累计',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(220, 38, 38, 0.65)' },
        barGap: '-100%',
        data: buildValues(sf)
      },
      // 左轴：新增贷款累计柱状（蓝半透明，与社融重叠）
      {
        name: '新增贷款累计',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(37, 99, 235, 0.65)' },
        barGap: '-100%',
        data: buildValues(loan)
      },
      // 右轴：M1 同比折线（蓝）
      {
        name: 'M1 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(m1)
      },
      // 右轴：M2 同比折线（红）
      {
        name: 'M2 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(m2)
      },
      // 右轴：M1-M2 剪刀差（紫 + 面积 + y=0 参考线）
      {
        name: 'M1-M2 剪刀差',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 3 },
        itemStyle: { color: '#7c3aed' },
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
        // y=0 参考线：虚线灰色，用于区分资金活化 / 沉淀
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

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div class="relative">
    <div ref="domRef" class="h-360px w-full"></div>
    <LatestTable :rows="latestRows" :left="66" />
  </div>
</template>
