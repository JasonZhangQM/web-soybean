<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../MetricCard.vue';
import TradeChart from './TradeChart.vue';
import FxReserveChart from './FxReserveChart.vue';
import { getLatest, getSeries } from '../utils';

defineOptions({ name: 'ExternalTab' });

/** 外贸与外部 Tab：4 张指标卡片 + 3 张图表 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值 =====
const exportUsdLatest = computed(() => getLatest(props.dataMap, 'CN_EXPORT_YOY_USD'));
const importUsdLatest = computed(() => getLatest(props.dataMap, 'CN_IMPORT_YOY_USD'));
const fxReserveLatest = computed(() => getLatest(props.dataMap, 'CN_FX_RESERVES'));

// ===== 贸易顺差（数据库 CN_TRADE_BALANCE_USD，单位亿美元）=====
const tradeBalanceLatest = computed(() => getLatest(props.dataMap, 'CN_TRADE_BALANCE_USD'));

// ===== 外汇储备转万亿美元（原值单位为亿美元，÷10000）=====
const fxReserveValue = computed(() => {
  const latest = fxReserveLatest.value;
  if (!latest) return null;
  return Number(latest.value) / 10000;
});

// ===== 图表数据 =====
const fxReserveSeries = computed(() => getSeries(props.dataMap, 'CN_FX_RESERVES'));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张 MetricCard -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="出口同比(美元)"
          :value="exportUsdLatest?.value ?? null"
          unit="%"
          :date="exportUsdLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="进口同比(美元)"
          :value="importUsdLatest?.value ?? null"
          unit="%"
          :date="importUsdLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="贸易顺差"
          :value="tradeBalanceLatest?.value ?? null"
          unit="亿美元"
          :date="tradeBalanceLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="外汇储备"
          :value="fxReserveValue"
          unit="万亿美元"
          :date="fxReserveLatest?.report_date"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 张图表（2 列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">进出口走势与贸易顺差</div>
          <div class="chart-box__sub">左轴折线为进出口同比(%)，右轴柱状为贸易顺差(亿美元)</div>
          <TradeChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">外汇储备</div>
          <div class="chart-box__sub">外汇储备稳定支撑人民币汇率，影响外资流入 A 股的意愿</div>
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
  margin-bottom: 4px;
}

.chart-box__sub {
  font-size: 11px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
}
</style>
