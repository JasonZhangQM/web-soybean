<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useBillsStore } from '@/store/modules/bills';
import CardData from './modules/card-data.vue';
import LineChart from './modules/line-chart.vue';
import PieAccChart from './modules/pie-acc-chart.vue';
import PieCategoryChart from './modules/pie-category-chart.vue';
import BarChart from './modules/bar-chart.vue';
import IndexCumReturnChart from './modules/index-cum-return-chart.vue';
import ProfitYearChart from './modules/profit-year-chart.vue';

const appStore = useAppStore();
const billsStore = useBillsStore();

const gap = computed(() => (appStore.isMobile ? 0 : 16));

// 首页统一加载共享数据：group-accs / group-symbols 各只请求一次，
// 子组件通过 watch store 数据响应更新，避免重复调用接口
onMounted(() => {
  billsStore.loadHomeGroupAccs();
  billsStore.loadHomeGroupSymbols();
});
</script>

<template>
  <NSpace vertical :size="16">
    <CardData />
    <NGrid :x-gap="gap" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:14">
        <NCard :bordered="false" class="card-wrapper h-full">
          <ProfitYearChart />
        </NCard>
      </NGi>
      <NGi span="24 s:24 m:5">
        <NCard :bordered="false" class="card-wrapper h-full">
          <PieAccChart />
        </NCard>
      </NGi>
      <NGi span="24 s:24 m:5">
        <NCard :bordered="false" class="card-wrapper h-full">
          <PieCategoryChart />
        </NCard>
      </NGi>
    </NGrid>
    <NGrid :x-gap="gap" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <IndexCumReturnChart />
      </NGi>
    </NGrid>
    <NGrid :x-gap="gap" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <NCard :bordered="false" class="card-wrapper">
          <LineChart />
        </NCard>
      </NGi>
    </NGrid>
    <NGrid :x-gap="gap" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <NCard :bordered="false" class="card-wrapper">
          <BarChart />
        </NCard>
      </NGi>
    </NGrid>
  </NSpace>
</template>

<style scoped></style>
