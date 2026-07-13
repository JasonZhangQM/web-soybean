<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'WeightBarChart' });

const themeStore = useThemeStore();

// 8 个指标综合影响力评分（编辑性主观评估，硬编码）
const barData = [
  { name: '联邦基金\n利率', value: 95, color: '#1e3a5f' },
  { name: '通胀\nCPI/PCE', value: 90, color: '#b8860b' },
  { name: '非农\n就业', value: 82, color: '#2d6a4f' },
  { name: '收益率\n曲线', value: 75, color: '#7b2d8e' },
  { name: 'ISM\nPMI', value: 68, color: '#d97706' },
  { name: '零售\n销售', value: 62, color: '#0891b2' },
  { name: 'GDP\n增长', value: 55, color: '#be123c' },
  { name: '消费者\n信心', value: 48, color: '#4f46e5' }
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

function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  return {
    animation: false,
    tooltip: { appendToBody: true, trigger: 'axis' },
    grid: { left: '3%', right: '8%', bottom: '10%', top: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      data: barData.map(d => d.name),
      axisLabel: { color: ink, fontSize: 11 },
      axisTick: { alignWithLabel: true },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '综合影响力评分',
      max: 100,
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'bar',
      data: barData.map(d => ({ value: d.value, itemStyle: { color: d.color } })),
      barWidth: '55%',
      label: {
        show: true,
        position: 'top',
        color: ink,
        fontSize: 11,
        fontWeight: 600
      }
    }]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时刷新文字颜色
watch(() => themeStore.darkMode, () => {
  updateOptions(() => buildOption());
});
</script>

<template>
  <div ref="domRef" class="h-380px w-full"></div>
</template>
