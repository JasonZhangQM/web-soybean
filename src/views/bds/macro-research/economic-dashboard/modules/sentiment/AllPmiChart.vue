<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'SentimentAllPmiChart' });

/** 四大 PMI 全景对比：4 条折线叠加 + 50 荣枯线参考线 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 构建 ECharts 配置：对齐四系列日期并集，缺失日期填充 null */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const officialMfg = getSeries(props.dataMap, 'CN_OFFICIAL_MFG_PMI');
  const ratingdogMfg = getSeries(props.dataMap, 'CN_RATINGDOG_MFG_PMI');
  const officialNonMfg = getSeries(props.dataMap, 'CN_OFFICIAL_NON_MFG_PMI');
  const ratingdogSvc = getSeries(props.dataMap, 'CN_RATINGDOG_SVC_PMI');

  // 收集四系列所有日期并去重排序
  const dateSet = new Set<string>();
  [officialMfg, ratingdogMfg, officialNonMfg, ratingdogSvc].forEach(arr =>
    arr.forEach(x => dateSet.add(x.report_date))
  );
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期该系列为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };

  // 以 50 荣枯线为中轴，根据数据偏离 50 的最大幅度上下对称扩展
  // PMI 数据通常在 40-60 区间，对称刻度便于直观对比扩张/收缩强度
  const allValues = [officialMfg, ratingdogMfg, officialNonMfg, ratingdogSvc]
    .flatMap(arr => arr.map(x => Number(x.value)))
    .filter((v): v is number => v != null && !Number.isNaN(v));
  const dataMaxDev = allValues.length
    ? Math.max(...allValues.map(v => Math.abs(v - 50)))
    : 10;
  // 偏离幅度向上取整到 5 的倍数 + 2 单位 padding，确保 50 居中
  const halfRange = Math.ceil((dataMaxDev + 2) / 5) * 5;
  const yMin = 50 - halfRange;
  const yMax = 50 + halfRange;
  // 自定义刻度：从 yMin 到 yMax 步长 5，确保 50 一定出现在刻度上
  const yInterval = 5;

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['官方制造业', '财新制造业', '官方非制造业', '财新服务业'] },
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
      min: yMin,
      max: yMax,
      interval: yInterval,
      nameTextStyle: { color: axisColor },
      axisLabel: {
        color: axisColor,
        // 50 荣枯线刻度文字加粗显示
        formatter: (value: number) => (value === 50 ? '50' : `${value}`)
      },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '官方制造业',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 制造业统一虚线，与非制造业实线区分
        lineStyle: { color: '#2563eb', width: 2, type: 'dashed' },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        // 50 荣枯线：加粗实线，>=50 扩张 / <50 收缩
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { type: 'solid', color: '#374151', width: 2 },
          data: [{ yAxis: 50 }]
        },
        data: buildValues(officialMfg)
      },
      {
        name: '财新制造业',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        // 制造业统一虚线，与非制造业实线区分
        lineStyle: { color: '#d97706', width: 2, type: 'dashed' },
        itemStyle: { color: '#d97706' },
        connectNulls: true,
        data: buildValues(ratingdogMfg)
      },
      {
        name: '官方非制造业',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#0d9488', width: 2 },
        itemStyle: { color: '#0d9488' },
        connectNulls: true,
        data: buildValues(officialNonMfg)
      },
      {
        name: '财新服务业',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true,
        data: buildValues(ratingdogSvc)
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
