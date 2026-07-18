<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 policy/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import FedRateRangeChart from './FedRateRangeChart.vue';
import RateVsPceChart from './RateVsPceChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'PolicyTab' });

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
const lowerLatest = computed(() => getLatest(props.dataMap, 'FED_FUNDS_RATE'));
const upperLatest = computed(() => getLatest(props.dataMap, 'FED_FUNDS_RATE_UPPER'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：2 张指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:6">
        <MetricCard
          label="利率下限"
          :value="lowerLatest?.value ?? null"
          unit="%"
          :date="lowerLatest?.report_date"
          :change="computeChange(lowerLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
        <MetricCard
          label="利率上限"
          :value="upperLatest?.value ?? null"
          unit="%"
          :date="upperLatest?.report_date"
          :change="computeChange(upperLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 张图表均跨双列（每张占满整行） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">联邦基金利率区间</div>
          <div class="chart-box__sub">FOMC 利率决策上限（红）与下限（蓝），上下限之间区间填充，反映政策利率走廊</div>
          <FedRateRangeChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">利率 vs 核心 PCE</div>
          <div class="chart-box__sub">左轴利率上下限（红/蓝）+ 右轴核心 PCE 同比（绿），观察政策利率与核心通胀的关系</div>
          <RateVsPceChart :data-map="dataMap" />
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
