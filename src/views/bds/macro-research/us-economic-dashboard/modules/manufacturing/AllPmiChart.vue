<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'ManufacturingAllPmiChart' });

/**
 * 四大 PMI 全景对比
 * ISM 制造业 / ISM 非制造业 / 标普全球制造业 / 标普全球服务业，4 折线 + 50 荣枯线
 * 以 ISM_MFG_PMI 日期为主轴，其他系列按 report_date 对齐（缺失填 null）
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

// 构建 ECharts 配置：4 条折线叠加，50 荣枯线参考线
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const ismMfg = getSeries(props.dataMap, 'ISM_MFG_PMI');
  const ismNonMfg = getSeries(props.dataMap, 'ISM_NON_MFG_PMI');
  const spMfg = getSeries(props.dataMap, 'SP_GLOBAL_MFG_PMI');
  const spSvc = getSeries(props.dataMap, 'SP_GLOBAL_SVC_PMI');

  // 以 ISM_MFG_PMI 日期为主轴，其他系列按 report_date 对齐（缺失填 null）
  const dates = ismMfg.map(x => x.report_date.slice(0, 7));
  const ismMfgValues = ismMfg.map(x => Number(x.value));

  const alignValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return ismMfg.map(x => {
      const v = map.get(x.report_date);
      return v == null ? null : v;
    });
  };

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['ISM制造业PMI', 'ISM非制造业PMI', '标普全球制造业PMI', '标普全球服务业PMI']
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
        data: ismMfgValues,
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
        data: alignValues(ismNonMfg),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' }
      },
      {
        name: '标普全球制造业PMI',
        type: 'line',
        data: alignValues(spMfg),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' }
      },
      {
        name: '标普全球服务业PMI',
        type: 'line',
        data: alignValues(spSvc),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316' }
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
