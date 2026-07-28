<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, alignAsOf } from '../utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'EmploymentNfpAdpUeChart' });

/**
 * 非农 / ADP / 初请失业救济 / 失业率 综合视图（双轴）
 * - 非农就业新增：柱状，左轴（万人），蓝色
 * - ADP 就业变动：柱状，左轴（万人），青色
 * - 初请失业救济人数：折线，左轴（万人），橙色（周频，as-of join 对齐到非农日期）
 * - 失业率：折线，右轴（%），绿色，附 4.2% 自然率参考线
 *
 * 合并自原 NfpAdpChart（非农 vs ADP 双柱）与 UnemploymentChart（失业率走势）。
 * 日期对齐策略：以 NONFARM_PAYROLL 日期为主轴，ADP/失业率按相同日期匹配，
 * 初请为周频与非农月频不重合，用 alignAsOf 取 <= 非农日期的最近一条。
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

// 最新值表格行：非农/ADP/初请单位万人，失业率单位 %
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'NONFARM_PAYROLL', name: '非农就业新增', color: '#3b82f6', unit: '万人' },
    { code: 'ADP_EMPLOYMENT_CHANGE', name: 'ADP 就业变动', color: '#14b8a6', unit: '万人' },
    { code: 'INITIAL_JOBLESS_CLAIMS', name: '初请失业救济', color: '#ea580c', unit: '万人' },
    { code: 'UNEMPLOYMENT_RATE', name: '失业率', color: '#16a34a', unit: '%' }
  ])
);

// 构建 ECharts 配置：双轴（左轴柱状非农+ADP+初请折线，右轴折线失业率）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  const nfpArr = getSeries(props.dataMap, 'NONFARM_PAYROLL');
  const adpArr = getSeries(props.dataMap, 'ADP_EMPLOYMENT_CHANGE');
  const claimsArr = getSeries(props.dataMap, 'INITIAL_JOBLESS_CLAIMS');
  const ueArr = getSeries(props.dataMap, 'UNEMPLOYMENT_RATE');

  // 以非农就业日期为主轴，ADP/失业率按相同日期匹配
  const adpMap = new Map(adpArr.map(x => [x.report_date, Number(x.value)]));
  const ueMap = new Map(ueArr.map(x => [x.report_date, Number(x.value)]));
  const dates = nfpArr.map(x => x.report_date.slice(0, 10));
  const nfpValues = nfpArr.map(x => Number(x.value));
  const adpValues = nfpArr.map(x => {
    const v = adpMap.get(x.report_date);
    return v == null ? null : v;
  });
  // 初请为周频，与非农月频日期不重合，用 as-of join 取 <= 非农日期的最近一条
  const claimsValues = alignAsOf(
    nfpArr.map(x => x.report_date),
    claimsArr
  );
  const ueValues = nfpArr.map(x => {
    const v = ueMap.get(x.report_date);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number, p: any) => {
        if (value == null) return '--';
        // 失业率系列（seriesName 命中）显示百分号
        return p?.seriesName === '失业率' ? `${Number(value).toFixed(2)}%` : Number(value).toFixed(2);
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['非农就业新增', 'ADP 就业变动', '初请失业救济', '失业率']
    },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    // 双轴：左轴非农+ADP+初请(万人) + 右轴失业率(%)
    yAxis: [
      {
        type: 'value',
        name: '万人',
        nameTextStyle: { color: muted },
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '失业率 %',
        nameTextStyle: { color: '#16a34a' },
        axisLabel: { color: '#16a34a', fontSize: 11, formatter: '{value}%' },
        axisLine: { lineStyle: { color: '#16a34a' } },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '非农就业新增',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 24,
        itemStyle: { color: '#3b82f680' },
        data: nfpValues
      },
      {
        name: 'ADP 就业变动',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 24,
        itemStyle: { color: '#14b8a680' },
        data: adpValues
      },
      {
        name: '初请失业救济',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ea580c', width: 2 },
        itemStyle: { color: '#ea580c' },
        connectNulls: true,
        data: claimsValues
      },
      {
        name: '失业率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#16a34a', width: 2 },
        itemStyle: { color: '#16a34a' },
        connectNulls: true,
        data: ueValues,
        // 4.2% 自然率参考线（虚线红色）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 },
          data: [{ yAxis: 4.2, label: { formatter: '自然率 4.2%', color: '#dc2626', fontSize: 10 } }]
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
    <div ref="domRef" class="h-260px w-full"></div>
    <LatestTable :rows="latestRows" :left="56" />
  </div>
</template>
