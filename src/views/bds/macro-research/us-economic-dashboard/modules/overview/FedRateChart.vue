<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'FedRateChart' });

/**
 * 联邦基金利率图
 * 利率上限（红） + 利率下限（蓝），上下限之间区间填充
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

// 构建 ECharts 配置：利率上限 + 利率下限 双折线 + 区间填充
// 区间填充实现：下限作为堆叠基线（透明填充），差值堆叠在其上方形成红色透明带，
// 上限为独立折线（不堆叠）以保持真实值显示
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const upperArr = getSeries(props.dataMap, 'FED_FUNDS_RATE_UPPER');
  const lowerArr = getSeries(props.dataMap, 'FED_FUNDS_RATE');

  // 以上限日期为主轴，按 report_date 对齐下限
  const lowerMap = new Map(lowerArr.map(x => [x.report_date, Number(x.value)]));
  const dates = upperArr.map(x => x.report_date.slice(0, 7));
  const upperValues = upperArr.map(x => Number(x.value));
  const lowerValues = upperArr.map(x => {
    const v = lowerMap.get(x.report_date);
    return v == null ? null : v;
  });

  // 区间差值：上限 - 下限，用于堆叠填充（保留 4 位小数避免浮点误差）
  const diffValues = upperValues.map((u, i) => {
    const l = lowerValues[i];
    if (u == null || l == null) return null;
    return +(u - l).toFixed(4);
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 过滤掉堆叠填充用的"区间"系列，tooltip 仅显示上下限真实值
      formatter: (params: any[]) => {
        const items = params.filter(p => p.seriesName !== '区间');
        if (!items.length) return '';
        const date = items[0].axisValueLabel;
        const lines = items.map(p => {
          const value = p.value;
          const formatted = value == null ? '--' : Number(value).toFixed(2);
          return `${p.marker} ${p.seriesName}: ${formatted}%`;
        });
        return `${date}<br/>${lines.join('<br/>')}`;
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      // 仅展示上限/下限，不展示辅助填充的"区间"
      data: ['利率上限', '利率下限']
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
      name: '%',
      nameTextStyle: { color: muted, fontSize: 11 },
      min: 0,
      max: 6,
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      // 1. 利率下限（堆叠基线，蓝色折线，无填充）
      {
        name: '利率下限',
        type: 'line',
        data: lowerValues,
        stack: 'fed-rate-band',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        areaStyle: { color: 'transparent' }
      },
      // 2. 区间填充（差值堆叠，无可见线条，仅用于填充上下限之间的区域）
      {
        name: '区间',
        type: 'line',
        data: diffValues,
        stack: 'fed-rate-band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        areaStyle: { color: '#dc262615' },
        silent: true
      },
      // 3. 利率上限（独立折线，红色，不堆叠以保持 tooltip 显示真实上限值）
      {
        name: '利率上限',
        type: 'line',
        data: upperValues,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' }
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
