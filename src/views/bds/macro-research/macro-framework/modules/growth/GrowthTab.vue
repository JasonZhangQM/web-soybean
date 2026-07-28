<script setup lang="ts">
import GrowthChart from './GrowthChart.vue';
import InvestChart from './InvestChart.vue';
import InvestRealChart from './InvestRealChart.vue';
import TradeChart from '../../../_shared/TradeChart.vue';

defineOptions({ name: 'GrowthTab' });

/**
 * 维度一：经济增长
 * 同比走势图
 * 注：城镇失业率属劳动力维度，已在③ 劳动力 Tab 展示
 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 2 行：2 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">GDP、工业增加值、城镇固投与社零同比</div>
          <GrowthChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">工业增加值与工业利润同比</div>
          <InvestChart :data-map="dataMap" />
        </div>
      </NGi>
    </NGrid>

    <!-- 第 3 行：2 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mt-16px">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">城镇固投与房地产投资同比</div>
          <InvestRealChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">进出口走势与贸易顺差</div>
          <TradeChart :data-map="dataMap" />
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
