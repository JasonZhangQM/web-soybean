<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'EmploymentCoreChart' });

/**
 * 就业市场核心图（双轴）
 * 失业率：折线，左轴（%），绿色
 * 非农就业：柱状，右轴（万人），蓝色
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

// 构建 ECharts 配置：失业率折线（左轴） + 非农就业柱状（右轴）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const unempArr = getSeries(props.dataMap, 'UNEMPLOYMENT_RATE');
  const nonfarmArr = getSeries(props.dataMap, 'NONFARM_PAYROLL');

  // 以失业率日期为主轴，按 report_date 对齐非农就业
  const nonfarmMap = new Map(nonfarmArr.map(x => [x.report_date, Number(x.value)]));
  const dates = unempArr.map(x => x.report_date.slice(0, 7));
  const unempValues = unempArr.map(x => Number(x.value));
  const nonfarmValues = unempArr.map(x => {
    const v = nonfarmMap.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'cross' },
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['失业率(%)', '非农就业(万人)']
    },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: [
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: muted, fontSize: 11 },
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '万人',
        nameTextStyle: { color: muted, fontSize: 11 },
        axisLabel: { color: muted, fontSize: 11 },
        // 右轴不绘制网格线，避免与左轴网格冲突（参考中国看板 SfVsM2Chart 实现）
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '失业率(%)',
        type: 'line',
        data: unempValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' }
      },
      {
        name: '非农就业(万人)',
        type: 'bar',
        yAxisIndex: 1,
        data: nonfarmValues,
        itemStyle: { color: '#3b82f6' },
        barMaxWidth: 24
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
