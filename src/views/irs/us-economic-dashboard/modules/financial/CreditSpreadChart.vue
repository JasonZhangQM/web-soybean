<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from './utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'CreditSpreadChart' });

/**
 * 信用利差综合图（单轴 %，三系列）
 * - 投资级信用利差（IG）：实线，蓝 #2563eb，FRED BAMLC0A4CBBB
 * - 高收益信用利差（HY）：实线，红 #dc2626，FRED BAMLH0A0HYM2
 * - 信用梯度溢价 = HY - IG：虚线 + 浅紫填充，紫 #a855f7
 *
 * 日期对齐：以 HY 日期为主轴，按 report_date 精确匹配 IG；梯度溢价按主轴日期计算（任一缺失记 null）。
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

// 最新值表格行：利差与梯度溢价单位均为 %
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.DailyIndicator>(props.dataMap, [
    { code: 'CREDIT_SPREAD_IG', name: '投资级信用利差', color: '#2563eb', unit: '%' },
    { code: 'CREDIT_SPREAD_HY', name: '高收益信用利差', color: '#dc2626', unit: '%' }
  ])
);

// 梯度溢价最新值需单独计算（HY - IG 同日对齐）
const gradientLatestRow = computed(() => {
  const hyArr = getSeries(props.dataMap, 'CREDIT_SPREAD_HY').filter(x => x.value != null);
  const igArr = getSeries(props.dataMap, 'CREDIT_SPREAD_IG').filter(x => x.value != null);
  if (!hyArr.length || !igArr.length) {
    return { name: '信用梯度溢价', color: '#a855f7', value: '--', date: '--' };
  }
  const igMap = new Map(igArr.map(x => [x.report_date, Number(x.value)]));
  // 从尾部向前找第一条能与 IG 同日对齐的 HY 记录
  for (let i = hyArr.length - 1; i >= 0; i--) {
    const ig = igMap.get(hyArr[i].report_date);
    if (ig != null) {
      return {
        name: '信用梯度溢价',
        color: '#a855f7',
        value: `${(Number(hyArr[i].value) - ig).toFixed(2)} %`,
        date: hyArr[i].report_date.slice(0, 10)
      };
    }
  }
  return { name: '信用梯度溢价', color: '#a855f7', value: '--', date: '--' };
});

// 合并 latestRows：IG / HY / 梯度溢价（顺序与图表系列一致）
const mergedLatestRows = computed(() => [...latestRows.value, gradientLatestRow.value]);

// 构建 ECharts 配置：两利差实线 + 梯度溢价虚线带填充（同单轴 %）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const igArr = getSeries(props.dataMap, 'CREDIT_SPREAD_IG').filter(x => x.value != null);
  const hyArr = getSeries(props.dataMap, 'CREDIT_SPREAD_HY').filter(x => x.value != null);

  // 以 HY 日期为主轴，按 report_date 精确匹配 IG（缺失填 null）
  const igMap = new Map(igArr.map(x => [x.report_date, Number(x.value)]));
  const dates = hyArr.map(x => x.report_date.slice(0, 10));
  const hyValues = hyArr.map(x => Number(x.value));
  const igValues = hyArr.map(x => {
    const v = igMap.get(x.report_date);
    return v == null ? null : v;
  });
  // 梯度溢价：同日 HY - IG，任一缺失记 null
  const gradientValues = hyArr.map(x => {
    const ig = igMap.get(x.report_date);
    if (ig == null) return null;
    return Number(x.value) - ig;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // 利差与梯度溢价单位均为 %，保留 2 位小数并加后缀
      valueFormatter: (value: number) => (value == null ? '--' : `${Number(value).toFixed(2)} %`)
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['投资级信用利差', '高收益信用利差', '信用梯度溢价']
    },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { show: false }
    },
    // 单轴 %：三系列同刻度，便于直接比较利差与梯度溢价的关系
    yAxis: {
      type: 'value',
      name: '利差 %',
      nameTextStyle: { color: muted, fontSize: 11 },
      scale: true,
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    series: [
      // 1. 投资级信用利差（蓝色实线）
      {
        name: '投资级信用利差',
        type: 'line',
        data: igValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true
      },
      // 2. 高收益信用利差（红色实线）
      {
        name: '高收益信用利差',
        type: 'line',
        data: hyValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true
      },
      // 3. 信用梯度溢价 = HY - IG（紫色虚线带浅紫填充）
      {
        name: '信用梯度溢价',
        type: 'line',
        data: gradientValues,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#a855f7', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#a855f7' },
        areaStyle: { color: '#a855f720' },
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
  <div class="relative">
    <div ref="domRef" class="h-360px w-full"></div>
    <LatestTable :rows="mergedLatestRows" :left="66" />
  </div>
</template>
