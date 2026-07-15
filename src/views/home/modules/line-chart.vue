<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useBillsStore } from '@/store/modules/bills';
import { useEcharts } from '@/hooks/common/echarts';

defineOptions({
  name: 'LineChart'
});

const appStore = useAppStore();
const billsStore = useBillsStore();

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
    data: ['总盈亏', '总浮盈'],
    top: '0'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '15%'
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: [] as string[]
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      color: '#8e9dff',
      name: '总盈亏',
      type: 'line',
      smooth: true,
      stack: 'Total',
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0.25,
              color: '#8e9dff'
            },
            {
              offset: 1,
              color: '#fff'
            }
          ]
        }
      },
      emphasis: {
        focus: 'series'
      },
      data: [] as number[]
    },
    {
      color: '#26deca',
      name: '总浮盈',
      type: 'line',
      smooth: true,
      stack: 'Total',
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0.25,
              color: '#26deca'
            },
            {
              offset: 1,
              color: '#fff'
            }
          ]
        }
      },
      emphasis: {
        focus: 'series'
      },
      data: []
    }
  ]
}));

// 从 store 共享数据渲染：各账户的总盈亏与总浮盈对比折线
function renderChart(items: Api.Bills.GroupAcc[]) {
  if (!items || items.length === 0) return;
  const accounts = items.map(item => item.account);
  // pl_all / pf_total 可能为 null，用 Number() 转换：null → 0
  const plAll = items.map(item => Number(item.pl_all));
  const pfTotal = items.map(item => Number(item.pf_total));

  updateOptions(opts => {
    opts.xAxis.data = accounts;
    opts.series[0].data = plAll;
    opts.series[1].data = pfTotal;
    return opts;
  });
}

// watch store 数据：首次加载及同步后强制刷新时自动更新
watch(
  () => billsStore.homeGroupAccs,
  items => renderChart(items),
  { immediate: true }
);

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

watch(
  () => appStore.locale,
  () => {
    updateLocale();
  }
);
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div ref="domRef" class="h-360px overflow-hidden"></div>
  </NCard>
</template>

<style scoped></style>
