<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useEcharts } from '@/hooks/common/echarts';
import { fetchGroupSymbols } from '@/service/api';

defineOptions({
  name: 'BarChart'
});

const appStore = useAppStore();

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow'
    }
  },
  legend: {
    data: ['总浮盈'],
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
    data: [] as string[],
    axisLabel: {
      // 标的代码可能较长，倾斜显示避免重叠
      rotate: 30
    }
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      name: '总浮盈',
      type: 'bar',
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
    }
  ]
}));

// 拉取全部标的汇总，按总浮盈降序取前 10 渲染柱状图
async function initData() {
  const { data, error } = await fetchGroupSymbols({ limit: 1000 });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.items || data.items.length === 0) return;

  // 按 pf_total 降序排序，取前 10；pf_total 可能为 null，用 Number() 转换：null → 0
  const sorted = [...data.items]
    .sort((a, b) => Number(b.pf_total) - Number(a.pf_total))
    .slice(0, 10);

  const symbols = sorted.map(item => item.symbol);
  const pfTotals = sorted.map(item => Number(item.pf_total));

  updateOptions(opts => {
    opts.xAxis.data = symbols;
    opts.series[0].data = pfTotals;

    return opts;
  });
}

// 语言切换时刷新中文名称（名称为固定中文，此处保持原刷新逻辑）
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();

    opts.legend.data = originOpts.legend.data;
    opts.series[0].name = originOpts.series[0].name;

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
  <NCard :bordered="false" class="card-wrapper">
    <div ref="domRef" class="h-360px overflow-hidden"></div>
  </NCard>
</template>

<style scoped></style>
