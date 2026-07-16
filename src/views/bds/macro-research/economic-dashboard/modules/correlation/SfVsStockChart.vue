<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, normalize, alignByDate } from '../utils';

defineOptions({ name: 'SfVsStockChart' });

interface Props {
  /** 宏观指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 上证指数时序 */
  stockIndex: Api.Bds.IndexHistory[];
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

// 对可能含 null 的数组做标准化：null 保持 null，非 null 值做 min-max 到 0-100
function normalizeWithNull(arr: Array<number | null>): Array<number | null> {
  const valid = arr.filter((x): x is number => x != null);
  if (!valid.length) return arr.map(() => null);
  const mn = Math.min(...valid);
  const mx = Math.max(...valid);
  if (mn === mx) return arr.map(() => 50);
  return arr.map(v => (v == null ? null : +(((v - mn) / (mx - mn)) * 100).toFixed(1)));
}

const SF_NAME = '社融增量(标准化)';
const STOCK_NAME = '上证指数(标准化)';

function buildOption() {
  const isDark = themeStore.darkMode;
  const axisLabelColor = isDark ? '#9ca3af' : '#6b7280';
  const splitColor = isDark ? '#374151' : '#d1d5db';

  // 社融增量为主 x 轴
  const sfArr = getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM');
  const dates = sfArr.map(x => x.report_date);
  const sfValues = sfArr.map(x => Number(x.value)); // 社融原始值（万亿元）
  const sfNorm = normalize(sfValues); // 社融标准化值
  // 上证指数按社融日期对齐（最近邻：取指数在该宏观日期之前的最近一条）
  const aligned = alignByDate(dates, props.stockIndex);
  const stockValues = aligned.map(x => x.stock?.close ?? null); // 上证原始收盘价
  const stockNorm = normalizeWithNull(stockValues); // 上证标准化值

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // tooltip 展示原始值，便于读取真实数值（图形为标准化值）
      // 不引用 buildOption 内部局部变量，原始值从 p.data.raw 取，避免 updateOptions 合并时丢失闭包
      formatter: (params: any) => {
        if (!params || !params.length) return '';
        const date = params[0].axisValue;
        let html = `<div style="font-weight:600;margin-bottom:2px">${date}</div>`;
        params.forEach((p: any) => {
          const raw = p.data?.raw;
          let display = '--';
          if (raw != null) {
            if (p.seriesName === SF_NAME) {
              display = `${Number(raw).toFixed(2)} 万亿元`;
            } else {
              display = Number(raw).toFixed(2);
            }
          }
          html += `<div>${p.marker}${p.seriesName}：${display}</div>`;
        });
        return html;
      }
    },
    legend: { bottom: 0, data: [SF_NAME, STOCK_NAME] },
    grid: { left: 50, right: 60, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisLabelColor },
      axisLine: { lineStyle: { color: splitColor } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '标准化值(0-100)',
      min: 0,
      max: 100,
      nameTextStyle: { color: axisLabelColor },
      axisLabel: { color: axisLabelColor },
      axisLine: { lineStyle: { color: splitColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: SF_NAME,
        type: 'line',
        smooth: true,
        color: '#dc2626',
        // data 用对象格式：value 为标准化值，raw 为原始值（万亿元），供 tooltip 读取
        data: sfNorm.map((v, i) => ({ value: v, raw: sfValues[i] }))
      },
      {
        name: STOCK_NAME,
        type: 'line',
        smooth: true,
        color: '#2563eb',
        // 上证原始值可能为 null，对应数据点保持 null 以断开连线
        data: stockNorm.map((v, i) => (v == null ? null : { value: v, raw: stockValues[i] }))
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 数据变化时重建（直接读 props，无需外部缓存）
watch(() => props.dataMap, () => updateOptions(() => buildOption()), { deep: true });
watch(() => props.stockIndex, () => updateOptions(() => buildOption()), { deep: true });
// 主题切换时重建（坐标轴颜色随主题变化）
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
</script>

<template>
  <div ref="domRef" class="h-320px w-full"></div>
</template>
