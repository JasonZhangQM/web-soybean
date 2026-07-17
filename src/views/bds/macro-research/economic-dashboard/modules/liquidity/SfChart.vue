<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'LiquiditySfChart' });

/**
 * 社融增量与新增人民币贷款合并柱状图：
 * 两个指标按日期对齐，同位置柱体重叠显示，不同颜色 + 透明度
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：两系列共用日期并集，缺失日期为 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const sfArr = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const loanArr = getSeries(props.dataMap, 'CN_NEW_RMB_LOANS_CUM');

  // 收集两个系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...sfArr, ...loanArr].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['社融增量', '新增贷款'] },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '亿元',
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '社融增量',
        type: 'bar',
        // 红色半透明，使重叠区域可辨识
        itemStyle: { color: 'rgba(220, 38, 38, 0.65)' },
        // 后绘制的系列（新增贷款）会覆盖在前方，社融在后
        barGap: '-100%',
        data: buildValues(sfArr)
      },
      {
        name: '新增贷款',
        type: 'bar',
        // 蓝色半透明
        itemStyle: { color: 'rgba(37, 99, 235, 0.65)' },
        barGap: '-100%',
        data: buildValues(loanArr)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
