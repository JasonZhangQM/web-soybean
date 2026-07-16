<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, alignByDate } from '../utils';

defineOptions({ name: 'PmiVsStockChart' });

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

const PMI_NAME = '官方制造业PMI';
const STOCK_NAME = '上证指数(标准化)';

function buildOption() {
  const isDark = themeStore.darkMode;
  const axisLabelColor = isDark ? '#9ca3af' : '#6b7280';
  const splitColor = isDark ? '#374151' : '#d1d5db';

  // PMI 为主 x 轴
  const pmiArr = getSeries(props.dataMap, 'CN_OFFICIAL_MFG_PMI');
  const dates = pmiArr.map(x => x.report_date);
  const pmiValues = pmiArr.map(x => Number(x.value)); // PMI 原始值
  // 上证按 PMI 日期对齐（最近邻）
  const aligned = alignByDate(dates, props.stockIndex);
  const stockValues = aligned.map(x => x.stock?.close ?? null); // 上证原始收盘价
  const stockNorm = normalizeWithNull(stockValues); // 上证标准化值

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // tooltip 展示原始值：PMI 原始值 + 上证原始收盘价
      formatter: (params: any) => {
        if (!params || !params.length) return '';
        const idx = params[0].dataIndex;
        const date = params[0].axisValue;
        let html = `<div style="font-weight:600;margin-bottom:2px">${date}</div>`;
        params.forEach((p: any) => {
          let raw = '--';
          if (p.seriesName === PMI_NAME) {
            raw = pmiValues[idx] != null ? pmiValues[idx].toFixed(2) : '--';
          } else if (p.seriesName === STOCK_NAME) {
            const v = stockValues[idx];
            raw = v != null ? v.toFixed(2) : '--';
          }
          html += `<div>${p.marker}${p.seriesName}：${raw}</div>`;
        });
        return html;
      }
    },
    legend: { bottom: 0, data: [PMI_NAME, STOCK_NAME] },
    grid: { left: 50, right: 70, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisLabelColor },
      axisLine: { lineStyle: { color: splitColor } },
      splitLine: { show: false }
    },
    // 双轴：左轴 PMI(44-56)，右轴上证标准化值(0-100)
    yAxis: [
      {
        type: 'value',
        name: 'PMI',
        position: 'left',
        min: 44,
        max: 56,
        nameTextStyle: { color: axisLabelColor },
        axisLabel: { color: axisLabelColor },
        axisLine: { lineStyle: { color: splitColor } },
        splitLine: { lineStyle: { color: splitColor } }
      },
      {
        type: 'value',
        name: '上证(0-100)',
        position: 'right',
        min: 0,
        max: 100,
        nameTextStyle: { color: axisLabelColor },
        axisLabel: { color: axisLabelColor },
        axisLine: { lineStyle: { color: splitColor } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: PMI_NAME,
        type: 'line',
        smooth: true,
        color: '#2563eb',
        yAxisIndex: 0,
        data: pmiValues,
        // 荣枯线 50（虚线灰色）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#9ca3af', type: 'dashed' },
          data: [{ yAxis: 50, label: { formatter: '荣枯线 50', color: '#9ca3af' } }]
        }
      },
      {
        name: STOCK_NAME,
        type: 'line',
        smooth: true,
        color: '#dc2626',
        yAxisIndex: 1,
        data: stockNorm
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
