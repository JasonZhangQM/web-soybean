<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'InflationYoYChart' });

/**
 * 通胀同比指标合并图：CPI / 核心 CPI / PCE / 核心 PCE / PPI 同比五折线
 * 合并自原 CpiChart + PceYoYChart + PpiChart 三个组件
 * 保留 PCE 同比的 2% 通胀目标参考线
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

// 最新值表格行：5 个同比指标，单位均为 %
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'CPI_YOY', name: 'CPI同比', color: '#dc2626', unit: '%' },
    { code: 'CORE_CPI_YOY', name: '核心CPI同比', color: '#f59e0b', unit: '%' },
    { code: 'PCE_YOY', name: 'PCE同比', color: '#7c3aed', unit: '%' },
    { code: 'CORE_PCE_YOY', name: '核心PCE同比', color: '#6366f1', unit: '%' },
    { code: 'PPI_YOY', name: 'PPI同比', color: '#0891b2', unit: '%' }
  ])
);

// 构建 ECharts 配置：五条同比折线 + 2% 目标线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const cpiArr = getSeries(props.dataMap, 'CPI_YOY');
  const coreCpiArr = getSeries(props.dataMap, 'CORE_CPI_YOY');
  const pceArr = getSeries(props.dataMap, 'PCE_YOY');
  const corePceArr = getSeries(props.dataMap, 'CORE_PCE_YOY');
  const ppiArr = getSeries(props.dataMap, 'PPI_YOY');

  // 以 CPI 同比日期为主轴（历史最长），按 report_date 对齐其余四项
  const coreCpiMap = new Map(coreCpiArr.map(x => [x.report_date, Number(x.value)]));
  const pceMap = new Map(pceArr.map(x => [x.report_date, Number(x.value)]));
  const corePceMap = new Map(corePceArr.map(x => [x.report_date, Number(x.value)]));
  const ppiMap = new Map(ppiArr.map(x => [x.report_date, Number(x.value)]));

  const dates = cpiArr.map(x => x.report_date.slice(0, 7));
  const cpiValues = cpiArr.map(x => Number(x.value));
  const coreCpiValues = cpiArr.map(x => {
    const v = coreCpiMap.get(x.report_date);
    return v == null ? null : v;
  });
  const pceValues = cpiArr.map(x => {
    const v = pceMap.get(x.report_date);
    return v == null ? null : v;
  });
  const corePceValues = cpiArr.map(x => {
    const v = corePceMap.get(x.report_date);
    return v == null ? null : v;
  });
  const ppiValues = cpiArr.map(x => {
    const v = ppiMap.get(x.report_date);
    return v == null ? null : v;
  });

  // 通用折线样式构造
  function line(name: string, data: (number | null)[], color: string) {
    return {
      name,
      type: 'line',
      data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      connectNulls: true,
      lineStyle: { color, width: 2 },
      itemStyle: { color }
    };
  }

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['CPI同比', '核心CPI同比', 'PCE同比', '核心PCE同比', 'PPI同比']
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
      // 第一条挂 2% 通胀目标参考线（沿用原 PceYoYChart 设计）
      {
        ...line('CPI同比', cpiValues, '#dc2626'),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 },
          data: [{ yAxis: 2, label: { formatter: '2% 目标', color: '#dc2626', fontSize: 10 } }]
        }
      },
      line('核心CPI同比', coreCpiValues, '#f59e0b'),
      line('PCE同比', pceValues, '#7c3aed'),
      line('核心PCE同比', corePceValues, '#6366f1'),
      // PPI 用青色与核心 CPI 的橙色区分
      line('PPI同比', ppiValues, '#0891b2')
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换 & 数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div class="relative">
    <div ref="domRef" class="h-260px w-full"></div>
    <LatestTable :rows="latestRows" :left="56" />
  </div>
</template>
