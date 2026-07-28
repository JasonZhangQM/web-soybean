<script setup lang="ts">
import GdpChart from './GdpChart.vue';
import BudgetChart from './BudgetChart.vue';
// 需求侧指标图表（原 consumption/ 目录，已归入 growth/）
import RetailDurableChart from './RetailDurableChart.vue';

defineOptions({ name: 'GrowthTab' });

interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  loading: false
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 3 张图表同一行：大屏三等分（l:8），中屏两等分后第三张换行（m:12） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <!-- 零售销售 & 耐用品订单 & 成屋销售（合并图，三折线双轴） -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">零售销售 & 耐用品订单 & 成屋销售</div>
          <RetailDurableChart :data-map="dataMap" />
        </div>
      </NGi>
      <!-- GDP 季环比 -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">GDP 季环比</div>
          <GdpChart :data-map="dataMap" />
        </div>
      </NGi>
      <!-- 政府预算 -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">政府预算</div>
          <BudgetChart :data-map="dataMap" />
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
  margin-bottom: 12px;
}
</style>
