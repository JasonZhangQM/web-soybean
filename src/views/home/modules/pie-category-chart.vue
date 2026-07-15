<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useBillsStore } from '@/store/modules/bills';
import { useEcharts } from '@/hooks/common/echarts';

defineOptions({
  name: 'PieCategoryChart'
});

const appStore = useAppStore();
const billsStore = useBillsStore();

const { domRef, updateOptions } = useEcharts(() => ({
  title: {
    text: '累计平仓盈亏(按类别)',
    left: 'center',
    top: '2%',
    textStyle: { fontSize: 14, fontWeight: 'normal' }
  },
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
      color: ['#5da8ff', '#8e9dff', '#fedc69', '#26deca', '#ff7875', '#91cc75', '#fac858', '#ee6666'],
      name: '累计平仓盈亏分布',
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

// 从 store 共享数据渲染：按交易分类汇总平仓盈亏（pl_all），过滤为 0 的分类
function renderChart(items: Api.Bills.GroupSymbol[]) {
  if (!items || items.length === 0) return;
  // 按交易分类分组，对平仓盈亏（pl_all）求和
  const categoryMap = new Map<string, number>();
  items.forEach(item => {
    const plAll = Number(item.pl_all) || 0;
    categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + plAll);
  });

  // 过滤掉平仓盈亏为 0 的分类，转为饼图数据格式，保留两位小数
  const pieData = Array.from(categoryMap.entries())
    .filter(([, value]) => value !== 0)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  updateOptions(opts => {
    opts.series[0].data = pieData;
    return opts;
  });
}

// watch store 数据：首次加载及同步后强制刷新时自动更新
watch(
  () => billsStore.homeGroupSymbols,
  items => renderChart(items),
  { immediate: true }
);

// 语言切换时刷新（名称为固定中文，此处保持原刷新逻辑）
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();
    opts.series[0].name = originOpts.series[0].name;
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
  <div ref="domRef" class="h-360px overflow-hidden"></div>
</template>

<style scoped></style>
