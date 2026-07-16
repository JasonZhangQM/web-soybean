<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'PmiChart' });

/**
 * PMI 走势图
 * 官方制造业 PMI（蓝） + 财新制造业 PMI（琥珀），50 荣枯线
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

// 构建 ECharts 配置：官方制造业 + 财新制造业 PMI 双折线，50 荣枯线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const officialArr = getSeries(props.dataMap, 'CN_OFFICIAL_MFG_PMI');
  const caixinArr = getSeries(props.dataMap, 'CN_RATINGDOG_MFG_PMI');

  // 以官方 PMI 日期为主轴，对齐财新 PMI
  const caixinMap = new Map(caixinArr.map(x => [x.report_date, Number(x.value)]));
  const dates = officialArr.map(x => x.report_date.slice(0, 7));
  const officialValues = officialArr.map(x => Number(x.value));
  const caixinValues = officialArr.map(x => {
    const v = caixinMap.get(x.report_date);
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
      data: ['官方制造业PMI', '财新制造业PMI']
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
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '官方制造业PMI',
        type: 'line',
        data: officialValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        // 50 荣枯线（虚线灰色）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 50, label: { formatter: '荣枯线 50', color: muted, fontSize: 10 } }]
        }
      },
      {
        name: '财新制造业PMI',
        type: 'line',
        data: caixinValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#d97706', width: 2 },
        itemStyle: { color: '#d97706' }
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
