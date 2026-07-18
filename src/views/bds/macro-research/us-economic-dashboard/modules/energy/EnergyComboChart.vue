<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'EnergyComboChart' });

/**
 * 原油 vs 汽油库存对比（双柱状叠加，跨双列，高 320px）
 * 原油库存变动（蓝）+ 汽油库存变动（橙），以原油日期为主轴对齐汽油
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

// 构建 ECharts 配置：双柱状图，以原油日期为主轴按 report_date 对齐汽油
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const crudeArr = getSeries(props.dataMap, 'EIA_CRUDE_OIL_INVENTORY_CHANGE');
  const gasolineArr = getSeries(props.dataMap, 'EIA_GASOLINE_INVENTORY_CHANGE');

  // 以原油日期为主轴，按 report_date 对齐汽油
  const gasolineMap = new Map(gasolineArr.map(x => [x.report_date, Number(x.value)]));
  const dates = crudeArr.map(x => x.report_date.slice(0, 10));
  const crudeValues = crudeArr.map(x => Number(x.value));
  const gasolineValues = crudeArr.map(x => {
    const v = gasolineMap.get(x.report_date);
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
      data: ['原油库存变动', '汽油库存变动']
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
      name: '万桶',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '原油库存变动',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: '#3b82f650' },
        data: crudeValues
      },
      {
        name: '汽油库存变动',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: '#f9731650' },
        data: gasolineValues
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
  <div ref="domRef" class="h-320px w-full"></div>
</template>
