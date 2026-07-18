<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'YieldsSpreadChart' });

/**
 * 2Y-10Y 利差柱状图
 * 正负着色：value ≥ 0 蓝（#3b82f670），value < 0 红（#dc262670）
 * 含 0 荣枯线 markLine（虚线灰色 #9ca3af），label 显示「倒挂线 0」
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

// 构建 ECharts 配置：单柱状图，按 value 正负着色，含 0 荣枯线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const arr = getSeries(props.dataMap, 'YIELD_SPREAD_2Y10Y');
  const dates = arr.map(x => x.report_date.slice(0, 10));
  const values = arr.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 利差单位为 %，保留 2 位小数并加后缀
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['2Y-10Y利差']
    },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: '%',
      nameTextStyle: { color: muted },
      scale: true,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '2Y-10Y利差',
        type: 'bar',
        // daily 频率数据柱体较窄
        barMaxWidth: 12,
        // 正负值不同颜色：≥0 蓝（正常），<0 红（倒挂）
        itemStyle: {
          color: (params: { value: number }) => (Number(params.value) >= 0 ? '#3b82f670' : '#dc262670')
        },
        data: values,
        // 0 荣枯线（虚线灰色），label 显示「倒挂线 0」
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 0, label: { formatter: '倒挂线 0', color: muted, fontSize: 10 } }]
        }
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换或数据变化时刷新
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-260px w-full"></div>
</template>
