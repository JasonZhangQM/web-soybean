<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/store/modules/app';
import CardData from './modules/card-data.vue';
import LineChart from './modules/line-chart.vue';
import PieChart from './modules/pie-chart.vue';
import BarChart from './modules/bar-chart.vue';

const appStore = useAppStore();

const gap = computed(() => (appStore.isMobile ? 0 : 16));
</script>

<template>
  <NSpace vertical :size="16">
    <CardData />
    <NGrid :x-gap="gap" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:14">
        <NCard :bordered="false" class="card-wrapper">
          <LineChart />
        </NCard>
      </NGi>
      <NGi span="24 s:24 m:10">
        <NCard :bordered="false" class="card-wrapper">
          <PieChart />
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
