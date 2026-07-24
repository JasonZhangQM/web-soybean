<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../../../_shared/utils';

defineOptions({ name: 'GrowthGrowthChart' });

/**
 * 经济增长走势图：GDP 同比 / 工业增加值同比 / 城镇固投同比 / 社零同比
 * 四条折线共用单轴(%)，按 report_date 取并集对齐，缺失日期填 null
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：五系列共用日期并集，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  // 亮色 #6b7280 / 暗色 #9ca3af
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  // 亮色 #d1d5db / 暗色 #374151
  const splitColor = dark ? '#374151' : '#d1d5db';

  const gdpArr = getSeries(props.dataMap, 'CN_GDP_YOY');
  const ivaArr = getSeries(props.dataMap, 'CN_INDUSTRIAL_VALUE_ADDED_YOY');
  const urbanInvestArr = getSeries(props.dataMap, 'CN_URBAN_FIXED_ASSET_INVEST_YOY');
  const retailArr = getSeries(props.dataMap, 'CN_RETAIL_SALES_YOY');
  const exportUsdArr = getSeries(props.dataMap, 'CN_EXPORT_YOY_USD');

  // 收集五系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...gdpArr, ...ivaArr, ...urbanInvestArr, ...retailArr, ...exportUsdArr].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['GDP 同比', '工业增加值同比', '城镇固投同比', '社零同比'] },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    // 四系列共用单轴(%)
    yAxis: {
      type: 'value',
      name: '%',
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: 'GDP 同比',
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { color: '#dc2626' },
        data: buildValues(gdpArr)
      },
      {
        name: '工业增加值同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(ivaArr)
      },
      {
        name: '城镇固投同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: buildValues(urbanInvestArr)
      },
      {
        name: '社零同比',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#9333ea', width: 2 },
        itemStyle: { color: '#9333ea' },
        connectNulls: true,
        data: buildValues(retailArr)
      },
      {
        name: '出口同比(美元)',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ea580c', width: 2 },
        itemStyle: { color: '#ea580c' },
        connectNulls: true,
        data: buildValues(exportUsdArr)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时重建配置以刷新坐标轴颜色
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
// 数据变更时刷新图表
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
