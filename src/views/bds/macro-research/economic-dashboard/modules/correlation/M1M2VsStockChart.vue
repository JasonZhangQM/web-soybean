<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';
import { getSeries, calcM1M2, alignByDate } from '../utils';

defineOptions({ name: 'M1M2VsStockChart' });

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

const SCISSORS_NAME = 'M1-M2剪刀差(%)';
const STOCK_NAME = '上证指数(标准化)';

function buildOption() {
  const isDark = themeStore.darkMode;
  const axisLabelColor = isDark ? '#9ca3af' : '#6b7280';
  const splitColor = isDark ? '#374151' : '#d1d5db';

  // 剪刀差为主 x 轴
  const m1Arr = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2Arr = getSeries(props.dataMap, 'CN_M2_YOY');
  const scissors = calcM1M2(m1Arr, m2Arr);
  const dates = scissors.map(x => x.report_date);
  const scissorsValues = scissors.map(x => x.value); // M1-M2 剪刀差原始值（%）
  // 上证按剪刀差日期对齐（最近邻）
  const aligned = alignByDate(dates, props.stockIndex);
  const stockValues = aligned.map(x => x.stock?.close ?? null); // 上证原始收盘价
  const stockNorm = normalizeWithNull(stockValues); // 上证标准化值

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      // tooltip 展示原始值：剪刀差原始 % + 上证原始收盘价
      // 不引用 buildOption 内部局部变量：剪刀差直接取 p.value，上证从 p.data.raw 取
      formatter: (params: any) => {
        if (!params || !params.length) return '';
        const date = params[0].axisValue;
        let html = `<div style="font-weight:600;margin-bottom:2px">${date}</div>`;
        params.forEach((p: any) => {
          let display = '--';
          if (p.seriesName === SCISSORS_NAME) {
            // 剪刀差数据为普通数字数组，直接用 p.value
            display = p.value != null ? `${Number(p.value).toFixed(2)} %` : '--';
          } else if (p.seriesName === STOCK_NAME) {
            // 上证图形显示标准化值，tooltip 显示 raw（原始收盘价）
            const raw = p.data?.raw;
            display = raw != null ? Number(raw).toFixed(2) : '--';
          }
          html += `<div>${p.marker}${p.seriesName}：${display}</div>`;
        });
        return html;
      }
    },
    legend: { bottom: 0, data: [SCISSORS_NAME, STOCK_NAME] },
    grid: { left: 50, right: 70, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisLabelColor },
      axisLine: { lineStyle: { color: splitColor } },
      splitLine: { show: false }
    },
    // 双轴：左轴剪刀差(%)，右轴上证标准化值(0-100)
    yAxis: [
      {
        type: 'value',
        name: '剪刀差(%)',
        position: 'left',
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
        name: SCISSORS_NAME,
        type: 'line',
        smooth: true,
        color: '#dc2626',
        yAxisIndex: 0,
        data: scissorsValues
      },
      {
        name: STOCK_NAME,
        type: 'line',
        smooth: true,
        color: '#2563eb',
        yAxisIndex: 1,
        // data 用对象格式：value 为标准化值，raw 为原始收盘价，供 tooltip 读取
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
