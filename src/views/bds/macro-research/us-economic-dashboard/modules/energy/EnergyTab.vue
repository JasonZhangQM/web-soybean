<script setup lang="ts">
import EnergyComboChart from './EnergyComboChart.vue';

defineOptions({ name: 'EnergyTab' });

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
    <!-- 原油 vs 汽油库存对比 -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">原油 vs 汽油库存对比</div>
          <div class="chart-box__sub">原油与汽油库存变动双柱对比，以原油日期为主轴对齐汽油，观察上下游库存同步性</div>
          <EnergyComboChart :data-map="dataMap" />
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
  margin-bottom: 4px;
}

.chart-box__sub {
  font-size: 11px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
}
</style>
