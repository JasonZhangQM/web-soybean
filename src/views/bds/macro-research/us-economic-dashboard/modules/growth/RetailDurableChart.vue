<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries } from '../utils';
import LatestTable from '../../../_shared/LatestTable.vue';
import { buildLatestRows } from '../../../_shared/latest-utils';

defineOptions({ name: 'ConsumptionRetailDurableChart' });

/**
 * 零售销售环比 & 耐用品订单环比 & 成屋销售年化（三折线图，双轴）
 * - 零售销售环比：蓝 #3b82f6，左轴 %
 * - 耐用品订单环比：紫 #7c3aed，左轴 %
 * - 成屋销售年化：青 #14b8a6，右轴 万户
 * 前两者同单位 % 共用左轴；成屋销售单位为万户，独立右轴。
 * 日期对齐：三者日期并集（月频，频率一致），缺失记 null。
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

// 最新值表格行：零售/耐用品单位 %，成屋销售单位 万户
const latestRows = computed(() =>
  buildLatestRows<Api.Bds.EconomicIndicator>(props.dataMap, [
    { code: 'RETAIL_SALES_MOM', name: '零售销售环比', color: '#3b82f6', unit: '%' },
    { code: 'DURABLE_GOODS_ORDERS_MOM', name: '耐用品订单环比', color: '#7c3aed', unit: '%' },
    { code: 'EXISTING_HOME_SALES', name: '成屋销售年化', color: '#14b8a6', unit: '万户' }
  ])
);

// 构建 ECharts 配置：零售销售 & 耐用品订单环比（左轴 %）+ 成屋销售年化（右轴 万户）
function buildOption() {
  const { ink, muted, rule } = getThemeColors();
  // 各指标分别过滤 null，保证数据干净
  const retailArr = getSeries(props.dataMap, 'RETAIL_SALES_MOM').filter(x => x.value != null);
  const durableArr = getSeries(props.dataMap, 'DURABLE_GOODS_ORDERS_MOM').filter(x => x.value != null);
  const houseArr = getSeries(props.dataMap, 'EXISTING_HOME_SALES').filter(x => x.value != null);

  // 日期并集（升序）：三者 report_date 合并去重
  const dateSet = new Set<string>();
  retailArr.forEach(x => dateSet.add(x.report_date.slice(0, 10)));
  durableArr.forEach(x => dateSet.add(x.report_date.slice(0, 10)));
  houseArr.forEach(x => dateSet.add(x.report_date.slice(0, 10)));
  const dates = Array.from(dateSet).sort();

  // 各指标按日期建 Map，便于 O(1) 查找
  const retailMap = new Map(retailArr.map(x => [x.report_date.slice(0, 10), Number(x.value)]));
  const durableMap = new Map(durableArr.map(x => [x.report_date.slice(0, 10), Number(x.value)]));
  const houseMap = new Map(houseArr.map(x => [x.report_date.slice(0, 10), Number(x.value)]));

  // 对齐主轴：缺失填 null（ECharts 折线默认 connectNulls=false，自动断开）
  const retailValues = dates.map(d => {
    const v = retailMap.get(d);
    return v == null ? null : v;
  });
  const durableValues = dates.map(d => {
    const v = durableMap.get(d);
    return v == null ? null : v;
  });
  const houseValues = dates.map(d => {
    const v = houseMap.get(d);
    return v == null ? null : v;
  });

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // axis 模式下 valueFormatter 第二参为 dataIndex 而非 seriesIndex，无法区分系列
      // 改用 formatter：params 数组中每个元素携带 seriesIndex/seriesName/value，可准确区分系列
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        // 日期轴标签
        const date = params[0].axisValueLabel || params[0].name || '';
        const lines = params.map((p: any) => {
          const v = p.value;
          // 成屋销售年化为第 3 个系列（seriesIndex=2），单位「万户」；前两个为 % 环比
          const unit = p.seriesIndex === 2 ? '万户' : '%';
          const valStr = v == null ? '--' : `${Number(v).toFixed(2)} ${unit}`;
          return `${p.marker}${p.seriesName}: ${valStr}`;
        });
        return [date, ...lines].join('<br/>');
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: ink, fontSize: 11 },
      data: ['零售销售环比', '耐用品订单环比', '成屋销售年化']
    },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    // 双轴：左轴 %（零售/耐用品）+ 右轴 万户（成屋销售）
    yAxis: [
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: muted },
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '万户',
        nameTextStyle: { color: '#14b8a6' },
        axisLabel: { color: '#14b8a6', fontSize: 11 },
        axisLine: { lineStyle: { color: '#14b8a6' } },
        // 右轴不绘制网格线，避免与左轴干扰
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '零售销售环比',
        type: 'line',
        yAxisIndex: 0,
        data: retailValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        connectNulls: true
      },
      {
        name: '耐用品订单环比',
        type: 'line',
        yAxisIndex: 0,
        data: durableValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#7c3aed', width: 2 },
        itemStyle: { color: '#7c3aed' },
        connectNulls: true
      },
      {
        name: '成屋销售年化',
        type: 'line',
        yAxisIndex: 1,
        data: houseValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' },
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
    <div ref="domRef" class="h-260px w-full"></div>
    <LatestTable :rows="latestRows" :left="56" />
  </div>
</template>
