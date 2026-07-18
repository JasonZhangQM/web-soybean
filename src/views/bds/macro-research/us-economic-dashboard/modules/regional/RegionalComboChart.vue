<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, normalize } from '../utils';

defineOptions({ name: 'RegionalComboChart' });

/**
 * 地区联储 vs ISM 制造业综合对比（跨双列，高 320px）
 * NY_FED_MFG_INDEX / RICHMOND_FED_MFG_INDEX / ISM_MFG_PMI 三指标
 * 由于量纲不同，每个指标独立 min-max 标准化至 0-100
 * 以 ISM_MFG_PMI 日期为主轴，按 report_date 精确对齐其他两个指标（未匹配为 null）
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

// 构建 ECharts 配置：三折线（标准化后），仅 ISM 含 50 荣枯线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const ismArr = getSeries(props.dataMap, 'ISM_MFG_PMI');
  const nyArr = getSeries(props.dataMap, 'NY_FED_MFG_INDEX');
  const richmondArr = getSeries(props.dataMap, 'RICHMOND_FED_MFG_INDEX');

  // 每个指标独立 min-max 标准化到 0-100
  const ismNorm = normalize(ismArr.map(x => Number(x.value)));
  const nyNorm = normalize(nyArr.map(x => Number(x.value)));
  const richmondNorm = normalize(richmondArr.map(x => Number(x.value)));

  // 以 ISM 日期为主轴，按 report_date 精确对齐其他两个指标
  const nyMap = new Map(nyArr.map((x, i) => [x.report_date, nyNorm[i]]));
  const richmondMap = new Map(richmondArr.map((x, i) => [x.report_date, richmondNorm[i]]));

  const dates = ismArr.map(x => x.report_date.slice(0, 7));
  const ismValues = ismNorm;
  const nyValues = ismArr.map(x => {
    const v = nyMap.get(x.report_date);
    return v == null ? null : v;
  });
  const richmondValues = ismArr.map(x => {
    const v = richmondMap.get(x.report_date);
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
      data: ['纽约联储制造业指数', '里士满联储制造业指数', 'ISM制造业PMI']
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
      scale: true,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '纽约联储制造业指数',
        type: 'line',
        data: nyValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#0891b2', width: 2 },
        itemStyle: { color: '#0891b2' }
      },
      {
        name: '里士满联储制造业指数',
        type: 'line',
        data: richmondValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' }
      },
      {
        name: 'ISM制造业PMI',
        type: 'line',
        data: ismValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        // 仅 ISM 制造业含 50 荣枯线（虚线灰色），挂在此 series 上
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 50, label: { formatter: '荣枯线 50', color: muted, fontSize: 10 } }]
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
  <div ref="domRef" class="h-320px w-full"></div>
</template>
