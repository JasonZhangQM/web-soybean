<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import InflationChart from './InflationChart.vue';
import { getLatest, getSeries, calcScissors } from '../../../economic-dashboard/modules/utils';

defineOptions({ name: 'InflationTab' });

/**
 * 维度二：通货膨胀
 * 3 张时序属性指标卡片（CPI/PPI/剪刀差）+ 1 张同比与剪刀差走势图
 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== CPI / PPI 最新值（用于顶部卡片） =====
const cpiLatest = computed(() => getLatest(props.dataMap, 'CN_CPI_YOY'));
const ppiLatest = computed(() => getLatest(props.dataMap, 'CN_PPI_YOY'));

// ===== CPI-PPI 剪刀差：CPI 同比 - PPI 同比，按 report_date 对齐 =====
const cpiSeries = computed(() => getSeries(props.dataMap, 'CN_CPI_YOY'));
const ppiSeries = computed(() => getSeries(props.dataMap, 'CN_PPI_YOY'));
const scissorsSeries = computed(() => calcScissors(cpiSeries.value, ppiSeries.value));
const scissorsLatest = computed(() => {
  const arr = scissorsSeries.value;
  return arr.length ? arr[arr.length - 1] : null;
});

// 同比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// 剪刀差：> 0 红色「下游受益」，< 0 绿色「上游受益」
const scissorsDesc = computed(() => {
  const v = scissorsLatest.value?.value;
  if (v == null) return '';
  return Number(v) > 0 ? '下游受益' : '上游受益';
});
const scissorsColor = computed(() => {
  const v = scissorsLatest.value?.value;
  if (v == null) return undefined;
  return Number(v) > 0 ? '#dc2626' : '#16a34a';
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：3 张指标卡片（单行排列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:8">
        <FwMetricCard
          label="CPI 同比"
          :value="cpiLatest?.value ?? null"
          unit="%"
          desc="下游消费价格"
          timing="滞后"
          :date="cpiLatest?.report_date"
          :change="computeChange(cpiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:8">
        <FwMetricCard
          label="PPI 同比"
          :value="ppiLatest?.value ?? null"
          unit="%"
          desc="上游工业品价格"
          timing="先行"
          :date="ppiLatest?.report_date"
          :change="computeChange(ppiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:8">
        <FwMetricCard
          label="CPI-PPI 剪刀差"
          :value="scissorsLatest?.value ?? null"
          unit="%"
          timing="先行"
          :date="scissorsLatest?.report_date"
          :desc="scissorsDesc"
          :color="scissorsColor"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：1 张图表（跨全宽） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">CPI、PPI 同比与 CPI-PPI 剪刀差</div>
          <InflationChart :data-map="dataMap" />
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
