<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';

defineOptions({ name: 'EmploymentComboChart' });

/**
 * 就业市场综合视图（双轴）
 * 失业率：折线，左轴，绿色
 * 非农就业新增：柱状，右轴，蓝色
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

// 构建 ECharts 配置：失业率折线（左轴）+ 非农柱状（右轴）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const nfpArr = getSeries(props.dataMap, 'NONFARM_PAYROLL');
  const ueArr = getSeries(props.dataMap, 'UNEMPLOYMENT_RATE');

  // 收集两系列所有日期并去重排序
  const dateSet = new Set<string>();
  [...nfpArr, ...ueArr].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null
  const buildValues = (arr: Api.Bds.EconomicIndicator[]) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value)]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
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
      data: ['失业率', '非农就业新增']
    },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    // 双轴：左轴失业率(%) + 右轴非农(万人)
    yAxis: [
      {
        type: 'value',
        name: '失业率 %',
        nameTextStyle: { color: '#16a34a' },
        axisLabel: { color: '#16a34a', fontSize: 11, formatter: '{value}%' },
        axisLine: { lineStyle: { color: '#16a34a' } },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '非农 万人',
        nameTextStyle: { color: '#3b82f6' },
        axisLabel: { color: '#3b82f6', fontSize: 11 },
        axisLine: { lineStyle: { color: '#3b82f6' } },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false },
        grid: { drawOnChartArea: false }
      }
    ],
    series: [
      {
        name: '失业率',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: buildValues(ueArr)
      },
      {
        name: '非农就业新增',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 24,
        itemStyle: { color: '#3b82f630' },
        data: buildValues(nfpArr)
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
