<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'EmploymentNfpAdpChart' });

/**
 * 非农就业 vs ADP 就业变动（双柱状图）
 * 非农就业（蓝）+ ADP 就业（青），以 NONFARM_PAYROLL 日期为主轴
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

// 构建 ECharts 配置：双柱状图，以 NONFARM_PAYROLL 日期为主轴对齐 ADP
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const nfpArr = getSeries(props.dataMap, 'NONFARM_PAYROLL');
  const adpArr = getSeries(props.dataMap, 'ADP_EMPLOYMENT_CHANGE');

  // 以非农就业日期为主轴，按 report_date 对齐 ADP
  const adpMap = new Map(adpArr.map(x => [x.report_date, Number(x.value)]));
  const dates = nfpArr.map(x => x.report_date.slice(0, 10));
  const nfpValues = nfpArr.map(x => Number(x.value));
  const adpValues = nfpArr.map(x => {
    const v = adpMap.get(x.report_date);
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
      data: ['非农就业新增', 'ADP 就业变动']
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
      name: '万人',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '非农就业新增',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: '#3b82f680' },
        data: nfpValues
      },
      {
        name: 'ADP 就业变动',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: '#14b8a680' },
        data: adpValues
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
