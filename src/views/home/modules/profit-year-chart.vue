<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useEcharts } from '@/hooks/common/echarts';
import { fetchProfitYears } from '@/service/api';

defineOptions({
  name: 'ProfitYearChart'
});

const appStore = useAppStore();

// 双 Y 轴混合图：柱状=平仓盈亏（左轴），折线=累计盈亏（右轴）
// 两者量级差距大（累计值随年份递增），独立轴避免柱状被压扁
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
    data: ['平仓盈亏', '累计盈亏'],
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
    data: [] as string[]
  },
  yAxis: [
    {
      type: 'value',
      name: '平仓盈亏'
    },
    {
      type: 'value',
      name: '累计盈亏'
    }
  ],
  series: [
    {
      name: '平仓盈亏',
      type: 'bar',
      yAxisIndex: 0,
      // 柱状图渐变色：从 #5da8ff 到 #26deca
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#5da8ff' },
            { offset: 1, color: '#26deca' }
          ]
        }
      },
      data: [] as number[]
    },
    {
      name: '累计盈亏',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      itemStyle: {
        color: '#fedc69'
      },
      emphasis: {
        focus: 'series'
      },
      data: [] as number[]
    }
  ]
}));

// 拉取全部年度收益，按年份升序渲染（折线累计盈亏从左到右递增更直观）
async function initData() {
  const { data, error } = await fetchProfitYears({ limit: 1000 });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.items || data.items.length === 0) return;

  // 后端返回降序，前端按 year 升序排序
  const sorted = [...data.items].sort((a, b) => a.year - b.year);
  const years = sorted.map(item => String(item.year));
  // pl_all / pl_cumulative 可能为 null，用 Number() 转换：null → 0
  const plAll = sorted.map(item => Number(item.pl_all));
  const plCumulative = sorted.map(item => Number(item.pl_cumulative));

  updateOptions(opts => {
    opts.xAxis.data = years;
    opts.series[0].data = plAll;
    opts.series[1].data = plCumulative;

    return opts;
  });
}

// 语言切换时刷新中文名称（名称为固定中文，此处保持原刷新逻辑）
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();

    opts.legend.data = originOpts.legend.data;
    opts.series[0].name = originOpts.series[0].name;
    opts.series[1].name = originOpts.series[1].name;

    return opts;
  });
}

async function init() {
  await initData();
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
  <div ref="domRef" class="h-360px overflow-hidden"></div>
</template>

<style scoped></style>
