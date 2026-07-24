<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 consumption/ → modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
import RetailChart from './RetailChart.vue';
import DurableChart from './DurableChart.vue';
import HouseChart from './HouseChart.vue';
import ConsumptionComboChart from './ConsumptionComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'ConsumptionTab' });

interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// ===== 各指标最新值（用于顶部卡片） =====
const retailLatest = computed(() => getLatest(props.dataMap, 'RETAIL_SALES_MOM'));
const durableLatest = computed(() => getLatest(props.dataMap, 'DURABLE_GOODS_ORDERS_MOM'));
const houseLatest = computed(() => getLatest(props.dataMap, 'EXISTING_HOME_SALES'));
const confidenceLatest = computed(() => getLatest(props.dataMap, 'CONSUMER_CONFIDENCE'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张指标卡片（大屏单行排列，l 断点 4*4=16 ≤ 24） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="零售销售环比"
          :value="retailLatest?.value ?? null"
          unit="%"
          :date="retailLatest?.report_date"
          :change="computeChange(retailLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="耐用品订单环比"
          :value="durableLatest?.value ?? null"
          unit="%"
          :date="durableLatest?.report_date"
          :change="computeChange(durableLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="成屋销售年化"
          :value="houseLatest?.value ?? null"
          unit="万户"
          :date="houseLatest?.report_date"
          :change="computeChange(houseLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="消费者信心指数"
          :value="confidenceLatest?.value ?? null"
          :date="confidenceLatest?.report_date"
          :change="computeChange(confidenceLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：4 张图表（2 列布局，最后一张跨双列） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">零售销售环比</div>
          <div class="chart-box__sub">环比增速正负分别着色：≥0 蓝色，&lt;0 红色</div>
          <RetailChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">耐用品订单环比</div>
          <div class="chart-box__sub">环比增速正负分别着色：≥0 紫色，&lt;0 红色</div>
          <DurableChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">成屋销售年化</div>
          <div class="chart-box__sub">折线 + 填充，反映房地产市场需求强度</div>
          <HouseChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:24">
        <div class="chart-box">
          <div class="chart-box__title">需求侧指标综合</div>
          <div class="chart-box__sub">零售销售、耐用品订单、成屋销售三大指标标准化后对比（0-100）</div>
          <ConsumptionComboChart :data-map="dataMap" />
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
