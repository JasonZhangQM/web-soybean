<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcM1M2 } from '../../../_shared/utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows, type LatestRow } from '../../../_shared/latest-utils';

defineOptions({ name: 'LiquidityComboChart' });

/** 流动性综合视图（双轴）
 *  左轴（万亿元）：社融增量柱状 红 + 新增贷款柱状 蓝（重叠半透明）
 *  右轴（%）：M1 同比折线 蓝、M2 同比折线 红、M1-M2 剪刀差紫色面积 + y=0 参考线
 *  xAxis 为所有系列日期并集 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 计算累计值指标最新一期的同比增速（社融增量累计 / 新增贷款累计通用）
 *  累计值为"当年年初至当月累计"，同比 = (本期累计 - 去年同月累计) / |去年同月累计| × 100
 *  去年同期按年月（YYYY-MM）匹配，规避同月日期不一致（01 vs 31）导致精确匹配失败
 */
function calcCumYoy(arr: Api.Bds.EconomicIndicator[]): number | null {
  if (arr.length < 2) return null;
  const latest = arr[arr.length - 1];
  const [y, m] = latest.report_date.slice(0, 7).split('-').map(Number);
  const prevYm = `${y - 1}-${String(m).padStart(2, '0')}`;
  // 升序数组从后向前找，同年月多条时取最新发布的一条
  const base = [...arr].reverse().find(x => x.report_date.slice(0, 7) === prevYm);
  if (!base) return null;
  const baseVal = Number(base.value);
  if (baseVal === 0) return null;
  return ((Number(latest.value) - baseVal) / Math.abs(baseVal)) * 100;
}

// 最新值表格行：社融/贷款原始单位为亿元，转换为万亿元展示；M1/M2/剪刀差单位 %
// 剪刀差为 calcM1M2 计算值，需单独从计算结果取最新
const latestRows = computed(() => {
  const rows: LatestRow[] = [];
  // 社融/贷款：除以 10000 将亿元转为万亿元
  const sfArr = (props.dataMap.get('CN_SOCIAL_FINANCING_CUM') ?? []).filter(x => x.value != null);
  const loanArr = (props.dataMap.get('CN_NEW_RMB_LOANS_CUM') ?? []).filter(x => x.value != null);
  const sfLatest = sfArr.length > 0 ? sfArr[sfArr.length - 1] : null;
  const loanLatest = loanArr.length > 0 ? loanArr[loanArr.length - 1] : null;
  rows.push({
    name: '社融增量累计',
    color: '#dc2626',
    value: sfLatest ? (Number(sfLatest.value) / 10000).toFixed(2) + ' 万亿元' : '--',
    date: sfLatest ? sfLatest.report_date.slice(0, 10) : '--'
  });
  // 社融同比增速：由前端根据社融原始累计值计算
  const sfYoy = calcCumYoy(sfArr);
  rows.push({
    name: '社融增量累计同比',
    color: '#b91c1c',
    value: sfYoy != null ? sfYoy.toFixed(2) + ' %' : '--',
    date: sfLatest ? sfLatest.report_date.slice(0, 10) : '--'
  });
  rows.push({
    name: '新增贷款累计',
    color: '#2563eb',
    value: loanLatest ? (Number(loanLatest.value) / 10000).toFixed(2) + ' 万亿元' : '--',
    date: loanLatest ? loanLatest.report_date.slice(0, 10) : '--'
  });
  // 新增贷款同比增速：与社融同比相同方式计算
  const loanYoy = calcCumYoy(loanArr);
  rows.push({
    name: '新增贷款累计同比',
    color: '#1d4ed8',
    value: loanYoy != null ? loanYoy.toFixed(2) + ' %' : '--',
    date: loanLatest ? loanLatest.report_date.slice(0, 10) : '--'
  });
  // M1/M2 同比通过通用工具构造
  rows.push(...buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'CN_M1_YOY', name: 'M1同比', color: '#2563eb', unit: '%' },
    { code: 'CN_M2_YOY', name: 'M2同比', color: '#dc2626', unit: '%' }
  ]));
  // M1-M2 剪刀差最新值：从 calcM1M2 计算结果取最后一条非 null
  const scissors = calcM1M2(
    getSeries(props.dataMap, 'CN_M1_YOY'),
    getSeries(props.dataMap, 'CN_M2_YOY')
  ).filter(x => x.value != null);
  const latestScissors = scissors.length > 0 ? scissors[scissors.length - 1] : null;
  rows.push({
    name: 'M1-M2剪刀差',
    color: '#7c3aed',
    value: latestScissors ? Number(latestScissors.value).toFixed(2) + ' %' : '--',
    date: latestScissors ? latestScissors.report_date.slice(0, 10) : '--'
  });
  return rows;
});

/** 构建 ECharts 配置：双轴混合图，日期并集对齐 */
function buildOption() {
  const dark = themeStore.darkMode;
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const splitColor = dark ? '#374151' : '#d1d5db';

  const sf = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const loan = getSeries(props.dataMap, 'CN_NEW_RMB_LOANS_CUM');
  const m1 = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');
  // 剪刀差按 M1、M2 日期计算后对齐到 dates
  const scissors = calcM1M2(m1, m2);

  // 收集所有系列日期并去重排序
  const dateSet = new Set<string>();
  [...sf, ...loan, ...m1, ...m2].forEach(x => dateSet.add(x.report_date));
  const dates = Array.from(dateSet).sort();

  // 按日期构建值映射，缺失日期为 null；divisor 用于单位换算（如亿元→万亿元除以 10000）
  const buildValues = (arr: Api.Bds.EconomicIndicator[], divisor = 1) => {
    const map = new Map(arr.map(x => [x.report_date, Number(x.value) / divisor]));
    return dates.map(d => (map.has(d) ? (map.get(d) as number) : null));
  };
  // 剪刀差按其自身日期对齐到 dates
  const scissorsMap = new Map(scissors.map(x => [x.report_date, x.value]));
  const scissorsValues = dates.map(d => (scissorsMap.has(d) ? (scissorsMap.get(d) as number) : null));

  return {
    tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2)) },
    legend: { bottom: 0, data: ['社融增量累计', '新增贷款累计', 'M1 同比', 'M2 同比', 'M1-M2 剪刀差'] },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '万亿元',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: splitColor } }
      },
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false }
      }
    ],
    series: [
      // 左轴：社融增量累计柱状（红半透明）
      {
        name: '社融增量累计',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(220, 38, 38, 0.65)' },
        barGap: '-100%',
        data: buildValues(sf, 10000)
      },
      // 左轴：新增贷款累计柱状（蓝半透明，与社融重叠）
      {
        name: '新增贷款累计',
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(37, 99, 235, 0.65)' },
        barGap: '-100%',
        data: buildValues(loan, 10000)
      },
      // 右轴：M1 同比折线（蓝）
      {
        name: 'M1 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        connectNulls: true,
        data: buildValues(m1)
      },
      // 右轴：M2 同比折线（红）
      {
        name: 'M2 同比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        connectNulls: true,
        data: buildValues(m2)
      },
      // 右轴：M1-M2 剪刀差（紫 + 面积 + y=0 参考线）
      {
        name: 'M1-M2 剪刀差',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 3 },
        itemStyle: { color: '#7c3aed' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(124, 58, 237, 0.35)' },
              { offset: 1, color: 'rgba(124, 58, 237, 0.02)' }
            ]
          }
        },
        // y=0 参考线：虚线灰色，用于区分资金活化 / 沉淀
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#9ca3af' },
          data: [{ yAxis: 0 }]
        },
        data: scissorsValues
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div class="relative">
    <div ref="domRef" class="h-360px w-full"></div>
    <LatestTable :rows="latestRows" :left="66" />
  </div>
</template>
