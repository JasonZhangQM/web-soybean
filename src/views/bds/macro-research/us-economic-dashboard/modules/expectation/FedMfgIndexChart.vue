<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'RegionalFedMfgIndexChart' });

/**
 * 纽约联储 & 里士满联储制造业指数（双折线 + 0 荣枯线）
 * - 纽约联储：青 #0891b2
 * - 里士满联储：紫 #7c3aed
 * 两者均无单位（指数），共用左轴，0 为扩张/收缩分界线
 * 日期对齐：并集（月频，频率一致），缺失记 null
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

// 构建 ECharts 配置：双折线 + 0 荣枯线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const nyArr = getSeries(props.dataMap, 'NY_FED_MFG_INDEX').filter(x => x.value != null);
  const richmondArr = getSeries(props.dataMap, 'RICHMOND_FED_MFG_INDEX').filter(x => x.value != null);

  // 日期并集（升序）
  const dateSet = new Set<string>();
  nyArr.forEach(x => dateSet.add(x.report_date.slice(0, 10)));
  richmondArr.forEach(x => dateSet.add(x.report_date.slice(0, 10)));
  const dates = Array.from(dateSet).sort();

  // 各指标按日期建 Map，便于 O(1) 查找
  const nyMap = new Map(nyArr.map(x => [x.report_date.slice(0, 10), Number(x.value)]));
  const richmondMap = new Map(richmondArr.map(x => [x.report_date.slice(0, 10), Number(x.value)]));

  // 对齐主轴：缺失填 null
  const nyValues = dates.map(d => {
    const v = nyMap.get(d);
    return v == null ? null : v;
  });
  const richmondValues = dates.map(d => {
    const v = richmondMap.get(d);
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
      data: ['纽约联储制造业指数', '里士满联储制造业指数']
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
        itemStyle: { color: '#0891b2' },
        connectNulls: true,
        // 0 荣枯线（虚线灰色）：仅在第一个系列声明，避免重复
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 0, label: { formatter: '荣枯线 0', color: muted, fontSize: 10 } }]
        }
      },
      {
        name: '里士满联储制造业指数',
        type: 'line',
        data: richmondValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true
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
