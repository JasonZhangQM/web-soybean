<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from './utils';

defineOptions({ name: 'YieldsComboChart' });

/**
 * 跨双列综合视图（双轴）
 * 左轴：2Y 折线（蓝 #2563eb）+ 10Y 折线（红 #dc2626）
 * 右轴：10Y-2Y 利差柱状（按正负着色：≥0 蓝 #3b82f670、<0 红 #dc262670）
 * 以 10Y 日期为主轴对齐 2Y 与利差（按 report_date 精确匹配）
 *
 * 适配 Api.Bds.DailyIndicator（value: number | null）：构建阶段过滤 value 为 null 的数据点
 */
interface Props {
  dataMap: Map<string, Api.Bds.DailyIndicator[]>;
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

// 构建 ECharts 配置：左轴双折线 + 右轴柱状（按正负着色）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const y10Arr = getSeries(props.dataMap, 'YIELD_10Y').filter(x => x.value != null);
  const y2Arr = getSeries(props.dataMap, 'YIELD_2Y').filter(x => x.value != null);
  const spreadArr = getSeries(props.dataMap, 'YIELD_SPREAD_10Y2Y').filter(x => x.value != null);

  // 以 10Y 日期为主轴，按 report_date 对齐 2Y 与利差（缺失填 null）
  const y2Map = new Map(y2Arr.map(x => [x.report_date, Number(x.value)]));
  const spreadMap = new Map(spreadArr.map(x => [x.report_date, Number(x.value)]));
  const dates = y10Arr.map(x => x.report_date.slice(0, 10));
  const y10Values = y10Arr.map(x => Number(x.value));
  const y2Values = y10Arr.map(x => {
    const v = y2Map.get(x.report_date);
    return v == null ? null : v;
  });
  const spreadValues = y10Arr.map(x => {
    const v = spreadMap.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 收益率/利差单位均为 %，保留 2 位小数并加后缀
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['2年期收益率', '10年期收益率', '10Y-2Y利差']
    },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    // 双轴：左轴收益率(%) + 右轴利差(%)
    yAxis: [
      {
        type: 'value',
        name: '收益率 %',
        nameTextStyle: { color: muted },
        scale: true,
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '利差 %',
        nameTextStyle: { color: muted },
        scale: true,
        axisLabel: { color: muted, fontSize: 11 },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '2年期收益率',
        type: 'line',
        yAxisIndex: 0,
        data: y2Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true
      },
      {
        name: '10年期收益率',
        type: 'line',
        yAxisIndex: 0,
        data: y10Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true
      },
      {
        name: '10Y-2Y利差',
        type: 'bar',
        yAxisIndex: 1,
        // daily 频率数据柱体较窄
        barMaxWidth: 12,
        // 正负值不同颜色：≥0 蓝（正常），<0 红（倒挂）
        itemStyle: {
          color: (params: { value: number }) => (Number(params.value) >= 0 ? '#3b82f670' : '#dc262670')
        },
        data: spreadValues
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
