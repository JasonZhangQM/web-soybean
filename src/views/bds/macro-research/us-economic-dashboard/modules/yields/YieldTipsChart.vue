<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from './utils';

defineOptions({ name: 'YieldTipsChart' });

/**
 * 10年期名义收益率（YIELD_10Y）vs 10年期 TIPS（YIELD_TIPS_10Y）双折线对比
 * 单 Y 轴（单位均为 %）：名义蓝 #2563eb、TIPS 橙 #ea580c
 *
 * 用途：观察盈亏平衡通胀率（= 名义收益率 - TIPS 收益率）
 * 两线差距 = 市场对未来 10 年平均通胀率的预期
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

// 构建 ECharts 配置：双折线，以 10Y 名义日期为主轴按 report_date 对齐 TIPS
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const y10Arr = getSeries(props.dataMap, 'YIELD_10Y').filter(x => x.value != null);
  const tipsArr = getSeries(props.dataMap, 'YIELD_TIPS_10Y').filter(x => x.value != null);

  // 以 10Y 名义日期为主轴，按 report_date 对齐 TIPS（缺失填 null）
  const tipsMap = new Map(tipsArr.map(x => [x.report_date, Number(x.value)]));
  const dates = y10Arr.map(x => x.report_date.slice(0, 10));
  const y10Values = y10Arr.map(x => Number(x.value));
  const tipsValues = y10Arr.map(x => {
    const v = tipsMap.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 收益率单位为 %，保留 2 位小数并加后缀
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['10年期名义收益率', '10年期TIPS']
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
      name: '%',
      nameTextStyle: { color: muted },
      scale: true,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      {
        name: '10年期名义收益率',
        type: 'line',
        data: y10Values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true
      },
      {
        name: '10年期TIPS',
        type: 'line',
        data: tipsValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ea580c', width: 2 },
        itemStyle: { color: '#ea580c' },
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
  <div ref="domRef" class="h-260px w-full"></div>
</template>
