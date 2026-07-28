<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from './utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'YieldsCompareChart' });

/**
 * 2年期 / 10年期美债收益率 + 10年期TIPS + 10Y-2Y 利差（合并视图，双轴）
 * - 2年期收益率：实线，左轴（%），蓝 #2563eb
 * - 10年期收益率：实线，左轴（%），红 #dc2626
 * - 10年期TIPS：实线，左轴（%），橙 #ea580c（与收益率同刻度，差距=盈亏平衡通胀率）
 * - 10Y-2Y 利差：虚线 + 填充，右轴（%），紫 #a855f7，含 0 倒挂线
 *
 * 日期对齐：以 10Y 日期为主轴，按 report_date 精确匹配 2Y / TIPS / 利差，缺失记 null。
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

// 最新值表格行：收益率/利差单位均为 %
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.DailyIndicator>(props.dataMap, [
    { code: 'YIELD_2Y', name: '2年期收益率', color: '#2563eb', unit: '%' },
    { code: 'YIELD_10Y', name: '10年期收益率', color: '#dc2626', unit: '%' },
    { code: 'YIELD_TIPS_10Y', name: '10年期TIPS', color: '#ea580c', unit: '%' },
    { code: 'YIELD_SPREAD_10Y2Y', name: '10Y-2Y利差', color: '#a855f7', unit: '%' }
  ])
);

// 构建 ECharts 配置：三折线（左轴）+ 利差虚线带填充（右轴）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const y10Arr = getSeries(props.dataMap, 'YIELD_10Y').filter(x => x.value != null);
  const y2Arr = getSeries(props.dataMap, 'YIELD_2Y').filter(x => x.value != null);
  const tipsArr = getSeries(props.dataMap, 'YIELD_TIPS_10Y').filter(x => x.value != null);
  const spreadArr = getSeries(props.dataMap, 'YIELD_SPREAD_10Y2Y').filter(x => x.value != null);

  // 以 10Y 日期为主轴，按 report_date 对齐 2Y / TIPS / 利差（缺失填 null）
  const y2Map = new Map(y2Arr.map(x => [x.report_date, Number(x.value)]));
  const tipsMap = new Map(tipsArr.map(x => [x.report_date, Number(x.value)]));
  const spreadMap = new Map(spreadArr.map(x => [x.report_date, Number(x.value)]));
  const dates = y10Arr.map(x => x.report_date.slice(0, 10));
  const y10Values = y10Arr.map(x => Number(x.value));
  const y2Values = y10Arr.map(x => {
    const v = y2Map.get(x.report_date);
    return v == null ? null : v;
  });
  const tipsValues = y10Arr.map(x => {
    const v = tipsMap.get(x.report_date);
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
      data: ['2年期收益率', '10年期收益率', '10年期TIPS', '10Y-2Y利差']
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
        name: '收益率/TIPS %',
        nameTextStyle: { color: muted },
        scale: true,
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '利差 %',
        nameTextStyle: { color: '#a855f7' },
        scale: true,
        axisLabel: { color: '#a855f7', fontSize: 11 },
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
        name: '10年期TIPS',
        type: 'line',
        yAxisIndex: 0,
        data: tipsValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ea580c', width: 2 },
        itemStyle: { color: '#ea580c' },
        connectNulls: true
      },
      {
        name: '10Y-2Y利差',
        type: 'line',
        yAxisIndex: 1,
        data: spreadValues,
        smooth: true,
        symbol: 'none',
        // 虚线 + 浅紫填充
        lineStyle: { color: '#a855f7', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#a855f7' },
        areaStyle: { color: '#a855f720' },
        connectNulls: true,
        // 0 倒挂线（虚线灰色），label 显示「倒挂线 0」
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed', width: 1 },
          data: [{ yAxis: 0, label: { formatter: '倒挂线 0', color: muted, fontSize: 10 } }]
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
  <div class="relative">
    <div ref="domRef" class="h-320px w-full"></div>
    <LatestTable :rows="latestRows" :left="66" />
  </div>
</template>
