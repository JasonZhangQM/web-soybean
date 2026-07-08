<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useEcharts } from '@/hooks/common/echarts';
import { fetchIndexCumReturns } from '@/service/api';

defineOptions({
  name: 'IndexCumReturnChart'
});

const appStore = useAppStore();

// 起始日期（留空则使用后端默认 30 天）
const startDate = ref<string | null>(null);

// 日期快捷选项：返回起始日时间戳
const dateShortcuts: Record<string, () => number> = {
  今年: () => new Date(new Date().getFullYear(), 0, 1).getTime(),
  近一年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  },
  近3年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.getTime();
  },
  近5年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.getTime();
  },
  近10年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.getTime();
  }
};

// 多色配色，按指数数量循环取色
const colors = ['#5da8ff', '#26deca', '#fedc69', '#ff7d85', '#a78bfa', '#34d399', '#fbbf24'];

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      label: {
        backgroundColor: '#6a7985'
      }
    }
  },
  legend: {
    data: [] as string[],
    top: '0'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '15%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: [] as string[]
  },
  yAxis: {
    type: 'value',
    name: '累计收益率(%)'
  },
  series: [] as never[]
}));

// 拉取指数累计收益率，动态构造各指数折线
async function initData() {
  // startDate 为空时传 undefined，使用后端默认 30 天
  const { data, error } = await fetchIndexCumReturns({ start_date: startDate.value || undefined });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.trade_dates || data.trade_dates.length === 0) return;

  const seriesNames = Object.keys(data.series);
  // 指数数量不固定，按索引循环取色动态生成折线
  const chartSeries = seriesNames.map((name, idx) => ({
    color: colors[idx % colors.length],
    name,
    type: 'line',
    smooth: true,
    data: data.series[name]
  }));

  updateOptions(opts => {
    opts.legend.data = seriesNames;
    opts.xAxis.data = data.trade_dates;
    opts.series = chartSeries as never;

    return opts;
  });
}

// 语言切换时刷新（指数名称为固定中文，此处保持原刷新逻辑）
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();

    opts.legend.data = originOpts.legend.data;
    opts.xAxis.data = originOpts.xAxis.data;
    opts.series = originOpts.series;

    return opts;
  });
}

async function init() {
  await initData();
}

// 日期选择器值变动时重新拉取数据
function handleDateChange() {
  init();
}

watch(
  () => appStore.locale,
  () => {
    updateLocale();
  }
);

// init
init();
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <!-- 左上角日期选择器：留空使用后端默认 30 天 -->
    <div class="mb-8px flex items-center">
      <span class="mr-8px text-14px text-color-2">起始日期</span>
      <NDatePicker
        v-model:formatted-value="startDate"
        type="date"
        value-format="yyyy-MM-dd"
        clearable
        placeholder="默认近30天"
        :shortcuts="dateShortcuts"
        :style="{ width: '150px' }"
        @update:formatted-value="handleDateChange"
      />
    </div>
    <div ref="domRef" class="h-480px overflow-hidden"></div>
  </NCard>
</template>

<style scoped></style>
