<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'SankeyChart' });

const themeStore = useThemeStore();

// 桑基图节点（从原始指标到最终美股走势的传导路径）
const nodes = [
  { name: '通胀(CPI/PCE)' },
  { name: '就业数据' },
  { name: '消费者信心' },
  { name: '零售销售' },
  { name: 'GDP增长' },
  { name: 'ISM PMI' },
  { name: '美联储利率' },
  { name: '收益率曲线' },
  { name: '企业盈利' },
  { name: '美股估值' },
  { name: '美股走势' }
];

// 桑基图连线：value 表示传导强度
const links = [
  { source: '通胀(CPI/PCE)', target: '美联储利率', value: 8 },
  { source: '就业数据', target: '美联储利率', value: 6 },
  { source: '就业数据', target: '消费者信心', value: 7 },
  { source: '就业数据', target: '零售销售', value: 7 },
  { source: '消费者信心', target: '零售销售', value: 8 },
  { source: '零售销售', target: 'GDP增长', value: 8 },
  { source: 'ISM PMI', target: 'GDP增长', value: 6 },
  { source: 'ISM PMI', target: '就业数据', value: 5 },
  { source: 'GDP增长', target: '企业盈利', value: 9 },
  { source: '美联储利率', target: '收益率曲线', value: 7 },
  { source: '美联储利率', target: '美股估值', value: 9 },
  { source: '收益率曲线', target: '美股估值', value: 5 },
  { source: '企业盈利', target: '美股走势', value: 9 },
  { source: '美股估值', target: '美股走势', value: 9 }
];

function buildOption() {
  // 暗色模式下使用浅色文字
  const ink = themeStore.darkMode ? '#e0e0e0' : '#1a1a2e';
  const accent = '#1e3a5f';
  return {
    animation: false,
    tooltip: { appendToBody: true },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency', disabled: false },
      nodeAlign: 'left',
      layoutIterations: 0,
      data: nodes,
      links: links,
      label: { color: ink, fontSize: 11 },
      lineStyle: { color: 'gradient', curveness: 0.5 },
      itemStyle: {
        color: accent,
        borderColor: accent,
        borderWidth: 1
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
  <div ref="domRef" class="h-480px w-full"></div>
</template>
