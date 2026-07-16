<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcScissors } from '../utils';

defineOptions({ name: 'ScissorsChart' });

/**
 * CPI-PPI 剪刀差图
 * CPI 同比（绿） + PPI 同比（蓝） + CPI-PPI 剪刀差（加粗紫）
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

// 构建 ECharts 配置：CPI + PPI 折线 + CPI-PPI 剪刀差加粗折线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const cpiArr = getSeries(props.dataMap, 'CN_CPI_YOY');
  const ppiArr = getSeries(props.dataMap, 'CN_PPI_YOY');
  const scissors = calcScissors(cpiArr, ppiArr);

  // 以 CPI 日期为主轴，对齐 PPI 与剪刀差
  const dates = cpiArr.map(x => x.report_date.slice(0, 7));
  const cpiValues = cpiArr.map(x => Number(x.value));
  const ppiMap = new Map(ppiArr.map(x => [x.report_date, Number(x.value)]));
  const ppiValues = cpiArr.map(x => {
    const v = ppiMap.get(x.report_date);
    return v == null ? null : v;
  });
  const scissorsMap = new Map(scissors.map(x => [x.report_date, x.value]));
  const scissorsValues = cpiArr.map(x => {
    const v = scissorsMap.get(x.report_date);
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
      data: ['CPI同比', 'PPI同比', 'CPI-PPI剪刀差']
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
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: 'CPI同比',
        type: 'line',
        data: cpiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' }
      },
      {
        name: 'PPI同比',
        type: 'line',
        data: ppiValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' }
      },
      {
        name: 'CPI-PPI剪刀差',
        type: 'line',
        data: scissorsValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 剪刀差加粗突出显示
        lineStyle: { color: '#7c3aed', width: 3 },
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
