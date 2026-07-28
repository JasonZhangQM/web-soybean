<script setup lang="ts">
import InflationYoYChart from './InflationYoYChart.vue';
import MichiganChart from './MichiganChart.vue';

defineOptions({ name: 'InflationTab' });

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
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">通胀同比指标对比</div>
          <div class="chart-box__sub">CPI / 核心 CPI / PCE / 核心 PCE / PPI 同比叠加；2% 为美联储长期通胀目标</div>
          <InflationYoYChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">密歇根通胀预期（5年 vs 1年）</div>
          <div class="chart-box__sub">消费者通胀预期调查，5 年预期锚定长期通胀信度，1 年预期反映短期看法</div>
          <MichiganChart :data-map="dataMap" />
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
