<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'InflationPceMomChart' });

/**
 * PCE 环比 vs 核心PCE 环比 双折线
 * PCE 环比（青）+ 核心 PCE 环比（蓝绿）
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

// 构建 ECharts 配置：PCE 环比 + 核心 PCE 环比双折线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const pceArr = getSeries(props.dataMap, 'PCE_MOM');
  const corePceArr = getSeries(props.dataMap, 'CORE_PCE_MOM');

  // 以 PCE 环比日期为主轴，按 report_date 对齐核心 PCE
  const corePceMap = new Map(corePceArr.map(x => [x.report_date, Number(x.value)]));
  const dates = pceArr.map(x => x.report_date.slice(0, 7));
  const pceValues = pceArr.map(x => Number(x.value));
  const corePceValues = pceArr.map(x => {
    const v = corePceMap.get(x.report_date);
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
      data: ['PCE环比', '核心PCE环比']
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
        name: 'PCE环比',
        type: 'line',
        data: pceValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' }
      },
      {
        name: '核心PCE环比',
        type: 'line',
        data: corePceValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: true,
        lineStyle: { color: '#06b6a4', width: 2 },
        itemStyle: { color: '#06b6a4' }
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
