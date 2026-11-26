<script setup lang="ts">
/**
 * 财务分析 Tab 通用图表卡片（2026-11-17）
 *
 * 财务 Tab 六张图（盈利/成长/归母净利润/归母扣非/现金流/偿债营运）结构同构：
 * x 轴报告期 + 若干 line/bar 系列（最多双轴）。抽成通用卡片避免重复配置，
 * 数值全部由 `GET /irs/um-finance-stats` 后端算好，这里只做排版。
 * actions 插槽透传给 SectionBar（标题栏右侧），供归母净利润卡放单季/报告期胶囊。
 */
import { computed, useSlots, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import SectionBar from './SectionBar.vue';

defineOptions({ name: 'UnderlyingFinanceChartCard' });

/** 单个系列定义：axisIndex 缺省 0（左轴） */
interface FinanceSeries {
  name: string;
  color: string;
  type: 'line' | 'bar';
  data: (number | null)[];
  axisIndex?: number;
}

/** ECharts tooltip formatter 参数中本卡用到的字段 */
interface TooltipParam {
  axisValue?: string;
  seriesName?: string;
  value: unknown;
}

interface Props {
  title: string;
  /** 标题右侧灰字（口径说明） */
  tip?: string;
  /** 报告期（ISO 字符串，升序） */
  dates: string[];
  series: FinanceSeries[];
  /** y 轴定义（1~2 个）：仅轴名，数值轴自适应 */
  yAxes?: string[];
  /** 卡片底部口径注释（如指数行的整体法说明） */
  note?: string;
  /**
   * 自定义 tooltip 行格式（可选）：轴标签 + 系列名 + 数值 → 行文本，返回 null 隐藏该行。
   * 缺省走内置 valueFormatter（仅数值两位小数）。归母净利润卡用它实现「柱值后直接跟同比」。
   */
  tipLineFormatter?: (axisLabel: string, seriesName: string, value: number | null) => string | null;
}

const props = defineProps<Props>();

const slots = useSlots();

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    valueFormatter: (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(2))
  },
  legend: {
    data: [] as string[],
    bottom: '0%',
    left: 'center',
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 12 }
  },
  grid: { left: '3%', right: '3%', bottom: '14%', top: '16%', containLabel: true },
  xAxis: { type: 'category', data: [] as string[] },
  yAxis: [] as never[],
  series: [] as never[]
}));

const hasPoint = computed(() => props.series.some(s => s.data.some(v => v != null)));

function refresh() {
  updateOptions(opts => {
    opts.xAxis.data = props.dates;
    // 双轴定义：缺省单轴；数值轴 scale 自适应，避免从 0 起压扁波动
    const axes = props.yAxes?.length ? props.yAxes : [''];
    opts.yAxis = axes.map(name => ({
      type: 'value',
      name,
      scale: true,
      splitNumber: 4,
      splitLine: { show: true }
    })) as never;
    opts.legend.data = props.series.map(s => s.name);
    opts.series = props.series.map(s => ({
      name: s.name,
      type: s.type,
      yAxisIndex: s.axisIndex ?? 0,
      barMaxWidth: 22,
      showSymbol: props.dates.length <= 10,
      connectNulls: s.type === 'line',
      itemStyle: { color: s.color },
      lineStyle: s.type === 'line' ? { width: 1.8 } : undefined,
      data: s.data
    })) as never;
    // 自定义 tooltip 行：逐系列映射为文本行，null 值（错位柱空位/断点）直接隐藏
    const fmt = props.tipLineFormatter;
    (opts.tooltip as unknown as { formatter?: unknown }).formatter = fmt
      ? (params: unknown) => {
          const arr = Array.isArray(params) ? (params as TooltipParam[]) : ([params] as TooltipParam[]);
          return arr
            .map(p => {
              const v = p.value == null || !Number.isFinite(Number(p.value)) ? null : Number(p.value);
              return fmt(String(p.axisValue ?? ''), String(p.seriesName ?? ''), v);
            })
            .filter(Boolean)
            .join('<br/>');
        }
      : undefined;
    return opts;
  });
}

watch(() => [props.dates, props.series, props.yAxes], refresh, { deep: true, immediate: true });
</script>

<template>
  <section class="mb-16px">
    <SectionBar :title="title">
      <span v-if="tip" class="text-12px op-60">{{ tip }}</span>
      <template v-if="slots.actions" #actions>
        <slot name="actions" />
      </template>
    </SectionBar>
    <div v-if="hasPoint" ref="domRef" class="h-260px w-full"></div>
    <div v-else class="h-60px w-full pt-16px text-center text-13px op-50">无数据</div>
    <div v-if="note" class="mt-4px text-12px op-60">{{ note }}</div>
  </section>
</template>
