<script setup lang="ts">
import SfVsStockChart from './SfVsStockChart.vue';
import M1M2VsStockChart from './M1M2VsStockChart.vue';
import PmiVsStockChart from './PmiVsStockChart.vue';

defineOptions({ name: 'CorrelationTab' });

interface Props {
  /** 宏观指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 上证指数时序 */
  stockIndex: Api.Bds.IndexHistory[];
  /** 加载中 */
  loading?: boolean;
}
withDefaults(defineProps<Props>(), { loading: false });
</script>

<template>
  <div class="correlation-tab">
    <NSpin :show="loading">
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16">
        <!-- 图1：社融增量 vs 上证指数（跨双列，双折线均标准化到 0-100） -->
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">社融增量 vs 上证指数</div>
            <div class="chart-box__sub">社融扩张通常领先上证上涨，社融收缩预示 A 股承压</div>
            <SfVsStockChart :data-map="dataMap" :stock-index="stockIndex" />
          </div>
        </NGi>
        <!-- 图2：M1-M2 剪刀差 vs 上证指数（双轴） -->
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">M1-M2 剪刀差 vs 上证指数</div>
            <div class="chart-box__sub">M1-M2 剪刀差向上资金活化，往往对应 A 股上行</div>
            <M1M2VsStockChart :data-map="dataMap" :stock-index="stockIndex" />
          </div>
        </NGi>
        <!-- 图3：官方制造业 PMI vs 上证指数（双轴，含荣枯线） -->
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">官方制造业 PMI vs 上证指数</div>
            <div class="chart-box__sub">PMI 趋势与 A 股走势正相关，PMI 回升预示股市走强</div>
            <PmiVsStockChart :data-map="dataMap" :stock-index="stockIndex" />
          </div>
        </NGi>
      </NGrid>
    </NSpin>
  </div>
</template>

<style scoped>
.correlation-tab {
  min-height: 320px;
}

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
