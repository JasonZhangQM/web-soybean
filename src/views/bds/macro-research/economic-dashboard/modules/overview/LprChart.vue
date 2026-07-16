<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'LprChart' });

/**
 * LPR 1Y vs 5Y 阶梯式折线图
 * 1Y LPR（红） + 5Y LPR（蓝），使用 step: 'middle' 实现阶梯式
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

// 构建 ECharts 配置：1Y LPR + 5Y LPR 阶梯式折线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const lpr1yArr = getSeries(props.dataMap, 'CN_LPR_1Y');
  const lpr5yArr = getSeries(props.dataMap, 'CN_LPR_5Y');

  // 以 1Y LPR 日期为主轴，对齐 5Y LPR
  const lpr5yMap = new Map(lpr5yArr.map(x => [x.report_date, Number(x.value)]));
  const dates = lpr1yArr.map(x => x.report_date.slice(0, 7));
  const lpr1yValues = lpr1yArr.map(x => Number(x.value));
  const lpr5yValues = lpr1yArr.map(x => {
    const v = lpr5yMap.get(x.report_date);
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
      data: ['1Y LPR', '5Y LPR']
    },
    grid: { left: 50, right: 50, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '1Y LPR',
        type: 'line',
        data: lpr1yValues,
        // 阶梯式折线：利率调整后保持至下次调整
        step: 'middle',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' }
      },
      {
        name: '5Y LPR',
        type: 'line',
        data: lpr5yValues,
        step: 'middle',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时刷新文字颜色
watch(() => themeStore.darkMode, () => {
  updateOptions(() => buildOption());
});
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
