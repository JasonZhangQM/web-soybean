<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../../../_shared/utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'ExpectationPmiChart' });

/**
 * 中国四大 PMI 走势图：官方制造业 / 官方非制造业 / 财新制造业 / 财新服务业
 * 官方 PMI 用实线，财新 PMI 用虚线；y=50 为荣枯分水岭参考线
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 最新值表格行：4 个 PMI 指标，无单位
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'CN_OFFICIAL_MFG_PMI', name: '官方制造业PMI', color: '#dc2626' },
    { code: 'CN_OFFICIAL_NON_MFG_PMI', name: '官方非制造业PMI', color: '#7c3aed' },
    { code: 'CN_RATINGDOG_MFG_PMI', name: '财新制造业PMI', color: '#2563eb' },
    { code: 'CN_RATINGDOG_SVC_PMI', name: '财新服务业PMI', color: '#16a34a' }
  ])
);

/** 构建 ECharts 配置：四系列共用日期并集，缺失日期填 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const officialMfg = getSeries(props.dataMap, 'CN_OFFICIAL_MFG_PMI');
  const officialNonMfg = getSeries(props.dataMap, 'CN_OFFICIAL_NON_MFG_PMI');
  const caixinMfg = getSeries(props.dataMap, 'CN_RATINGDOG_MFG_PMI');
  const caixinSvc = getSeries(props.dataMap, 'CN_RATINGDOG_SVC_PMI');

  // 收集四系列所有日期并去重排序
  const dateSet = new Set<string>();
  [officialMfg, officialNonMfg, caixinMfg, caixinSvc].forEach(arr => arr.forEach(x => dateSet.add(x.report_date)));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['官方制造业PMI', '官方非制造业PMI', '财新制造业PMI', '财新服务业PMI'] },
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
      name: 'PMI',
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } },
      // y 轴不从 0 开始，根据数据范围自适应（保留少量边距，避免折线贴边）
      scale: true,
      min: value => Math.floor((value.min - 1) * 10) / 10,
      max: value => Math.ceil((value.max + 1) * 10) / 10
    },
    series: [
      {
        name: '官方制造业PMI',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 官方实线：红色
        lineStyle: { color: '#dc2626', width: 2, type: 'solid' },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(officialMfg)
      },
      {
        name: '官方非制造业PMI',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 官方实线：紫色（与红色拉开差异）
        lineStyle: { color: '#7c3aed', width: 2, type: 'solid' },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true,
        data: buildValues(officialNonMfg)
      },
      {
        name: '财新制造业PMI',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 财新虚线：蓝色
        lineStyle: { color: '#2563eb', width: 2, type: 'dashed' },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(caixinMfg)
      },
      {
        name: '财新服务业PMI',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 财新虚线：绿色
        lineStyle: { color: '#16a34a', width: 2, type: 'dashed' },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        // y=50 荣枯分水岭参考线
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 50 }]
        },
        data: buildValues(caixinSvc)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div class="relative">
    <div ref="domRef" class="h-360px w-full"></div>
    <LatestTable :rows="latestRows" :left="56" />
  </div>
</template>
