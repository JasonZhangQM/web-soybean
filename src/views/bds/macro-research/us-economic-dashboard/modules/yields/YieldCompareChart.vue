<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'YieldsCompareChart' });

/**
 * 2年期 vs 10年期美债收益率双折线
 * 2Y 蓝（#2563eb）+ 10Y 红（#dc2626），以 10Y 日期为主轴对齐 2Y（按 report_date 精确匹配）
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

// 构建 ECharts 配置：双折线，以 10Y 日期为主轴按 report_date 对齐 2Y
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const y10Arr = getSeries(props.dataMap, 'YIELD_10Y');
  const y2Arr = getSeries(props.dataMap, 'YIELD_2Y');

  // 以 10Y 日期为主轴，按 report_date 对齐 2Y（缺失填 null）
  const y2Map = new Map(y2Arr.map(x => [x.report_date, Number(x.value)]));
  const dates = y10Arr.map(x => x.report_date.slice(0, 10));
  const y10Values = y10Arr.map(x => Number(x.value));
  const y2Values = y10Arr.map(x => {
    const v = y2Map.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 收益率单位为 %，保留 2 位小数并加后缀
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['2年期收益率', '10年期收益率']
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
      nameTextStyle: { color: muted },
      scale: true,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '2年期收益率',
        type: 'line',
        data: y2Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true
      },
      {
        name: '10年期收益率',
        type: 'line',
        data: y10Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true
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
  <div ref="domRef" class="h-260px w-full"></div>
</template>
