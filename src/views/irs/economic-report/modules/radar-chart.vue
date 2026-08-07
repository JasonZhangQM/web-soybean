<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'RadarChart' });

// 主题 store：用于暗色模式下动态切换文字颜色
const themeStore = useThemeStore();

// 五维评分数据（编辑性主观评估，硬编码）
const indicators = [
  { name: '联邦基金利率', value: [95, 30, 20, 98, 90], color: '#1e3a5f' },
  { name: '通胀(CPI/PCE)', value: [60, 70, 45, 95, 95], color: '#b8860b' },
  { name: '就业数据', value: [40, 80, 55, 92, 88], color: '#2d6a4f' },
  { name: 'GDP增长', value: [30, 90, 5, 85, 50], color: '#7b2d8e' },
  { name: 'ISM PMI', value: [25, 65, 85, 70, 60], color: '#d97706' }
];

// 根据暗色模式返回对应的文字/线条颜色
function getThemeColors() {
  const dark = themeStore.darkMode;
  return {
    ink: dark ? '#e0e0e0' : '#1a1a2e',
    muted: dark ? '#9ca3af' : '#6b7280',
    rule: dark ? '#374151' : '#d1d5db'
  };
}

// 构建 ECharts 配置：颜色后缀 '22' 为 13% 透明度的面积填充
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  return {
    animation: false,
    radar: {
      center: ['50%', '55%'],
      radius: '70%',
      indicator: [
        { name: '估值影响', max: 100 },
        { name: '盈利影响', max: 100 },
        { name: '领先性', max: 100 },
        { name: '市场关注度', max: 100 },
        { name: '波动触发', max: 100 }
      ],
      axisName: { color: muted, fontSize: 11 },
      splitArea: { areaStyle: { color: ['transparent'] } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: indicators.map(item => ({
        value: item.value,
        name: item.name,
        lineStyle: { color: item.color, width: 2 },
        areaStyle: { color: item.color + '22' },
        itemStyle: { color: item.color },
        symbol: 'circle',
        symbolSize: 5
      })),
      emphasis: { disabled: true }
    }],
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 12
    },
    tooltip: { appendToBody: true }
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时刷新文字颜色
watch(() => themeStore.darkMode, () => {
  updateOptions(() => buildOption());
});
</script>

<template>
  <div ref="domRef" class="h-420px w-full"></div>
</template>
