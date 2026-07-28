<script setup lang="ts">
import NfpAdpUeChart from './NfpAdpUeChart.vue';
import JoltsChart from './JoltsChart.vue';

defineOptions({ name: 'EmploymentTab' });

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
    <!-- 第 2 行：2 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">非农 / ADP / 失业率</div>
          <div class="chart-box__sub">非农与 ADP 双柱对比（左轴万人）+ 失业率折线（右轴 %），4.2% 为自然率参考线</div>
          <NfpAdpUeChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">JOLTS 职位空缺</div>
          <div class="chart-box__sub">职位空缺数反映劳动力市场需求强度，与失业率负相关</div>
          <JoltsChart :data-map="dataMap" />
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
