<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { marginGroupOf, scenarioLabel } from './utils';

defineOptions({ name: 'MarginStackChart' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Bills.RiskBoard;
  /** 情景模式 */
  mode: string;
}>();

/** 后端 grid 的键：0 写成 '0.0'，其余与 JS 数字串一致 */
function gridKey(drop: number): string {
  return drop === 0 ? '0.0' : String(drop);
}

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { data: [] as string[], top: 0 },
  grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
  xAxis: { type: 'category' as const, data: [] as string[] },
  yAxis: { type: 'value' as const, name: '保证金' },
  series: [] as any[]
}));

/**
 * 保证金结构：优先用 detail 逐仓数据按品种族堆叠；
 * detail 缺失时降级为单序列「保证金合计」，不伪造结构。
 */
function renderChart() {
  const grid = props.board.grid[props.mode] ?? {};
  const labels = props.board.steps.map(scenarioLabel);
  const hasDetail = props.board.steps.some(d => (grid[gridKey(d)]?.ALL?.detail ?? []).length > 0);

  let names: string[];
  let matrix: number[][];

  if (hasDetail) {
    const totals = new Map<string, number[]>();
    props.board.steps.forEach((d, idx) => {
      (grid[gridKey(d)]?.ALL?.detail ?? []).forEach(item => {
        const group = marginGroupOf(item);
        if (!totals.has(group))
          totals.set(
            group,
            props.board.steps.map(() => 0)
          );
        totals.get(group)![idx] += item.margin;
      });
    });
    names = [...totals.keys()];
    matrix = names.map(n => totals.get(n)!);
  } else {
    names = ['保证金合计'];
    matrix = [props.board.steps.map(d => grid[gridKey(d)]?.ALL?.margin ?? 0)];
  }

  updateOptions(opts => {
    opts.legend.data = names;
    opts.xAxis.data = labels;
    opts.series = names.map((name, i) => ({
      name,
      type: 'bar' as const,
      stack: 'margin',
      emphasis: { focus: 'series' as const },
      data: matrix[i]
    }));
    return opts;
  });
}

watch(() => [props.board, props.mode], renderChart, { immediate: true });
</script>

<template>
  <div ref="domRef" class="h-360px overflow-hidden" />
</template>
