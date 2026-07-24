<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import FxReserveChart from '../../../_shared/FxReserveChart.vue';
import { getLatest, getSeries } from '../../../_shared/utils';

defineOptions({ name: 'ExternalTab' });

/** 维度六：外部环境 Tab —— 4 张指标卡片 + 1 张外汇储备图表
 *  注：进出口走势与贸易顺差图表已移至 ① 增长 Tab
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值（数组按 report_date 升序，最后一项为最新）=====
const exportUsdLatest = computed(() => getLatest(props.dataMap, 'CN_EXPORT_YOY_USD'));
const importUsdLatest = computed(() => getLatest(props.dataMap, 'CN_IMPORT_YOY_USD'));
const fxReserveLatest = computed(() => getLatest(props.dataMap, 'CN_FX_RESERVES'));

// ===== 贸易顺差（数据库 CN_TRADE_BALANCE_USD，单位亿美元）=====
const tradeBalanceLatest = computed(() => getLatest(props.dataMap, 'CN_TRADE_BALANCE_USD'));

// ===== 外汇储备：原值单位为亿美元，÷10000 转万亿美元 =====
const fxReserveValue = computed(() => {
  const latest = fxReserveLatest.value;
  if (!latest) return null;
  return Number(latest.value) / 10000;
});

// ===== 外汇储备时序数组（图表用）=====
const fxReserveSeries = computed(() => getSeries(props.dataMap, 'CN_FX_RESERVES'));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张 FwMetricCard，全部 timing="一致" -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="出口同比(美元)"
          :value="exportUsdLatest?.value ?? null"
          unit="%"
          desc="反映外需强度"
          :date="exportUsdLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="进口同比(美元)"
          :value="importUsdLatest?.value ?? null"
          unit="%"
          desc="反映内需"
          :date="importUsdLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="贸易顺差"
          :value="tradeBalanceLatest?.value ?? null"
          unit="亿美元"
          :date="tradeBalanceLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="外汇储备"
          :value="fxReserveValue"
          unit="万亿美元"
          desc="稳定支撑人民币汇率"
          :date="fxReserveLatest?.report_date"
          timing="一致"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：外汇储备图表（全宽） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:24">
        <div class="chart-box">
          <div class="chart-box__title">外汇储备</div>
          <FxReserveChart :data="fxReserveSeries" />
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
