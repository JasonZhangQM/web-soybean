<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'MfgPmiChart' });

/**
 * 制造业景气度图
 * ISM 制造业 PMI（蓝） + ISM 非制造业 PMI（紫），50 荣枯线
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

// 构建 ECharts 配置：ISM 制造业 + ISM 非制造业 双折线，50 荣枯线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const mfgArr = getSeries(props.dataMap, 'ISM_MFG_PMI');
  const nonMfgArr = getSeries(props.dataMap, 'ISM_NON_MFG_PMI');

  // 以 ISM 制造业日期为主轴，按 report_date 对齐 ISM 非制造业
  const nonMfgMap = new Map(nonMfgArr.map(x => [x.report_date, Number(x.value)]));
  const dates = mfgArr.map(x => x.report_date.slice(0, 7));
  const mfgValues = mfgArr.map(x => Number(x.value));
  const nonMfgValues = mfgArr.map(x => {
    const v = nonMfgMap.get(x.report_date);
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
      data: ['ISM制造业PMI', 'ISM非制造业PMI']
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
        name: 'ISM制造业PMI',
        type: 'line',
        data: mfgValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        // 50 荣枯线（虚线灰色），仅挂在首条 series 上即可
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 50, label: { formatter: '荣枯线 50', color: muted, fontSize: 10 } }]
        }
      },
      {
        name: 'ISM非制造业PMI',
        type: 'line',
        data: nonMfgValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' }
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
