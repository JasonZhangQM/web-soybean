<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useEcharts } from '@/hooks/common/echarts';
import { fetchGroupSymbols } from '@/service/api';

defineOptions({
  name: 'PieChart'
});

const appStore = useAppStore();

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'item'
  },
  legend: {
    bottom: '1%',
    left: 'center',
    itemStyle: {
      borderWidth: 0
    }
  },
  series: [
    {
      color: ['#5da8ff', '#8e9dff', '#fedc69', '#26deca'],
      name: '持仓类别分布',
      type: 'pie',
      radius: ['45%', '75%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 1
      },
      label: {
        show: false,
        position: 'center'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: '12'
        }
      },
      labelLine: {
        show: false
      },
      data: [] as { name: string; value: number }[]
    }
  ]
}));

// 按 category 分组统计数量，渲染持仓类别分布饼图
async function initData() {
  const { data, error } = await fetchGroupSymbols({ limit: 1000 });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.items || data.items.length === 0) return;

  // 按 category 聚合计数
  const categoryCount = new Map<string, number>();
  data.items.forEach(item => {
    const cat = item.category;
    categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
  });

  const pieData = Array.from(categoryCount.entries()).map(([name, value]) => ({ name, value }));

  updateOptions(opts => {
    opts.series[0].data = pieData;

    return opts;
  });
}

// 语言切换时刷新中文名称（名称为固定中文，此处保持原刷新逻辑）
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();

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
