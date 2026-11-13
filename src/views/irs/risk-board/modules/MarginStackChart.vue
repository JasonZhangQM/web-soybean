<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { marginGroupOf, scenarioLabel } from './utils';

defineOptions({ name: 'MarginStackChart' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Irs.RiskBoard;
  /** 情景模式 */
  mode: string;
  /** 五档档位压力结果：传入时 x 轴由 11 档涨跌幅改为「现价 + 五档」 */
  levels?: Api.Irs.SimulateLevelsResult | null;
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
/**
 * 保证金结构按品种族堆叠（复用 utils.marginGroupOf，全站唯一分组规则）。
 * - 档位压力：x 轴 = 现价 + 五档，逐仓 margin_at 来自 levels.*.positions，
 *   前端只做展示层分组求和，不推算任何保证金公式（🔒4.13）；
 * - 旧全组同跌：x 轴 = 11 档涨跌幅，读 board.grid.*.detail；无 detail 时
 *   降级为单序列「保证金合计」，不伪造结构。
 */
function renderChart() {
  let labels: string[];
  let names: string[];
  let matrix: number[][];

  if (props.levels) {
    const lv = props.levels;
    const keys = ['base', ...lv.level_order];
    labels = keys.map(k => (k === 'base' ? '现价' : (lv.level_labels[k] ?? k)));
    const totals = new Map<string, number[]>();
    keys.forEach((k, idx) => {
      const pos = k === 'base' ? lv.baseline.positions : (lv.levels[k]?.positions ?? []);
      pos.forEach(item => {
        const group = marginGroupOf({ kind: item.kind, mtype: item.mtype });
        if (!totals.has(group))
          totals.set(
            group,
            keys.map(() => 0)
          );
        totals.get(group)![idx] += Number(item.margin_at ?? 0);
      });
    });
    names = [...totals.keys()];
    matrix = names.map(n => totals.get(n)!);
  } else {
    const grid = props.board.grid[props.mode] ?? {};
    labels = props.board.steps.map(scenarioLabel);
    const hasDetail = props.board.steps.some(d => (grid[gridKey(d)]?.ALL?.detail ?? []).length > 0);
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

watch(() => [props.board, props.mode, props.levels], renderChart, { immediate: true });
</script>

<template>
  <div ref="domRef" class="h-360px overflow-hidden" />
</template>
