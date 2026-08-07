<script setup lang="ts">
import LiquidityComboChart from './LiquidityComboChart.vue';
import LprChart from './LprChart.vue';

defineOptions({ name: 'PolicyTab' });

/** 维度五：政策环境 Tab —— 2 张图表（流动性综合视图、LPR） */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 2 行：2 张图表（2 列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">流动性综合视图</div>
          <LiquidityComboChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">LPR 1Y vs 5Y</div>
          <LprChart :data-map="dataMap" />
        </div>
      </NGi>
    </NGrid>
  </NSpin>
</template>

<style scoped>
.chart-box {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 8px;
  padding: 16px;
}

.chart-box__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
  text-align: center;
  margin-bottom: 12px;
}
</style>
