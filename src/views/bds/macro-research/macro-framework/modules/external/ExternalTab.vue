<script setup lang="ts">
import { computed } from 'vue';
import FxReserveChart from './FxReserveChart.vue';
import SwiftCnyShareChart from './SwiftCnyShareChart.vue';
import { getSeries } from '../../../_shared/utils';

defineOptions({ name: 'ExternalTab' });

/** 维度六：外部环境 Tab —— 2 张图表（Swift人民币占比、外汇储备） */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 图表时序数据 =====
const swiftCnyShareSeries = computed(() => getSeries(props.dataMap, 'CN_SWIFT_CNY_SHARE'));
const fxReserveSeries = computed(() => getSeries(props.dataMap, 'CN_FX_RESERVES'));
</script>

<template>
  <NSpin :show="loading">
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
  text-align: center;
  margin-bottom: 12px;
}
</style>
