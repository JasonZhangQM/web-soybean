<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import FxReserveChart from '../../../_shared/FxReserveChart.vue';
import SwiftCnyShareChart from '../../../_shared/SwiftCnyShareChart.vue';
import { getLatest, getSeries } from '../../../_shared/utils';

defineOptions({ name: 'ExternalTab' });

/** 维度六：外部环境 Tab —— 2 张指标卡片 + 2 张图表（Swift人民币占比、外汇储备） */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== Swift 人民币占比最新值（单位：%）=====
const swiftCnyShareLatest = computed(() => getLatest(props.dataMap, 'CN_SWIFT_CNY_SHARE'));

// ===== 外汇储备最新值：原值单位为亿美元，÷10000 转万亿美元 =====
const fxReserveLatest = computed(() => getLatest(props.dataMap, 'CN_FX_RESERVES'));
const fxReserveValue = computed(() => {
  const latest = fxReserveLatest.value;
  if (!latest) return null;
  return Number(latest.value) / 10000;
});

// ===== 图表时序数据 =====
const swiftCnyShareSeries = computed(() => getSeries(props.dataMap, 'CN_SWIFT_CNY_SHARE'));
const fxReserveSeries = computed(() => getSeries(props.dataMap, 'CN_FX_RESERVES'));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：2 张 FwMetricCard -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:12 l:12">
        <FwMetricCard
          label="Swift人民币占比"
          :value="swiftCnyShareLatest?.value ?? null"
          unit="%"
          desc="人民币国际化进程"
          :date="swiftCnyShareLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:12 l:12">
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

    <!-- 第 2 行：2 张图表（Swift人民币占比 + 外汇储备） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">Swift人民币占比</div>
          <SwiftCnyShareChart :data="swiftCnyShareSeries" />
        </div>
      </NGi>
      <NGi span="24 m:12">
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
