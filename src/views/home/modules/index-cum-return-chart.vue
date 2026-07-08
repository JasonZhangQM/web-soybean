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
  yAxis: [
    {
      type: 'value',
      name: '累计收益率(%)',
      splitNumber: 5,
      min: 0,
      max: 0
    },
    {
      type: 'value',
      name: '最大回撤(%)',
      max: 0,
      min: 0,
      splitNumber: 5,
      splitLine: { show: false }
    }
  ],
  series: [] as never[]
}));

// 拉取指数累计收益率，动态构造各指数折线
async function initData() {
  // startDate 为空时传 undefined，使用后端默认 30 天
  const { data, error } = await fetchIndexCumReturns({ start_date: startDate.value || undefined });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.trade_dates || data.trade_dates.length === 0) return;

  const seriesNames = Object.keys(data.series);
  // 累计收益率折线（实线），使用左 Y 轴，按索引循环取色
  const cumSeries = seriesNames.map((name, idx) => ({
    color: colors[idx % colors.length],
    name,
    type: 'line',
    smooth: true,
    yAxisIndex: 0,
    data: data.series[name]
  }));
  // 最大回撤折线（仅面积填充），使用右 Y 轴（0在顶部，向下延伸形成倒山峰），与累计收益率同色
  const drawdownSeries = seriesNames.map((name, idx) => ({
    color: colors[idx % colors.length],
    name: `${name}-回撤`,
    type: 'line',
    smooth: true,
    yAxisIndex: 1,
    lineStyle: { opacity: 0 },
    symbol: 'none',
    areaStyle: { opacity: 0.2 },
    data: data.max_drawdown[name]
  }));

  const chartSeries = [...cumSeries, ...drawdownSeries];
  // legend 包含累计收益率名称与回撤名称
  const allNames = [...seriesNames, ...seriesNames.map(n => `${n}-回撤`)];

  updateOptions(opts => {
    opts.legend.data = allNames;
    opts.xAxis.data = data.trade_dates;
    opts.series = chartSeries as never;

    // 动态计算左轴（累计收益率）范围，右轴（最大回撤）对称取负，保证刻度跨度一致
    const allCumReturns = seriesNames.flatMap(n => data.series[n] ?? []);
    const cumMax = Math.max(0, ...allCumReturns.filter((v): v is number => v !== null));
    const cumMin = Math.min(0, ...allCumReturns.filter((v): v is number => v !== null));
    // 左轴最小值向下取整到10的倍数，最大值向上取整到10的倍数
    const leftMin = Math.floor(cumMin / 10) * 10;
    const leftMax = Math.ceil(cumMax / 10) * 10;
    // 右轴0在顶部，min为左轴范围的负值，保证跨度对称
    const rightMin = -(leftMax - leftMin);

    opts.yAxis[0].min = leftMin;
    opts.yAxis[0].max = leftMax;
    opts.yAxis[1].min = rightMin;
    // yAxis[1].max 已在初始化时设为 0

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
