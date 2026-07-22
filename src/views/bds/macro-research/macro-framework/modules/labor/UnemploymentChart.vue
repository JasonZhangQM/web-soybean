<script setup lang="ts">
import { watch } from 'vue';
import { useEcharts } from '@/hooks/common/echarts';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'LaborUnemploymentChart' });

/** 城镇调查失业率折线图：橙色折线 + 浅橙渐变填充，y 轴单位 % */
interface Props {
  data: Api.Bds.EconomicIndicator[];
}
const props = withDefaults(defineProps<Props>(), {});

const themeStore = useThemeStore();

/** 主色：橙 */
const COLOR = '#ea580c';

/** 构建 ECharts 配置：数据为空时返回空配置 */
function buildOption() {
  const dark = themeStore.darkMode;
  // 亮色 #6b7280 / 暗色 #9ca3af
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  // 亮色 #d1d5db / 暗色 #374151
  const splitColor = dark ? '#374151' : '#d1d5db';

  const dates = props.data.map(x => x.report_date);
  const values = props.data.map(x => Number(x.value));

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      valueFormatter: (value: number) => (value == null ? '--' : Number(value).toFixed(2))
    },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '%',
      nameTextStyle: { color: axisColor },
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '城镇调查失业率',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: COLOR, width: 2 },
        itemStyle: { color: COLOR },
        // 浅橙渐变填充：顶部 25% 透明度到底部接近透明
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(234, 88, 12, 0.25)' },
              { offset: 1, color: 'rgba(234, 88, 12, 0.02)' }
            ]
          }
        },
        data: values
      }
    ]
  } as any;
}

const { domRef, updateOptions } = useEcharts(buildOption);

// 暗色模式切换时重建配置以刷新坐标轴颜色
watch(() => themeStore.darkMode, () => updateOptions(() => buildOption()));
// 数据变更时刷新图表
watch(() => props.data, () => updateOptions(() => buildOption()), { deep: true });
</script>

<template>
  <div ref="domRef" class="h-300px w-full"></div>
</template>
