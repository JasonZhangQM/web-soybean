<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../MetricCard.vue';
import RetailChart from './RetailChart.vue';
import RealEstateChart from './RealEstateChart.vue';
import SwiftChart from './SwiftChart.vue';
import { getLatest, getSeries } from '../utils';

defineOptions({ name: 'DemandTab' });

/** 消费与投资 Tab：3 张指标卡片 + 3 张图表 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值 =====
const retailLatest = computed(() => getLatest(props.dataMap, 'CN_RETAIL_SALES_YOY'));
const realEstateLatest = computed(() => getLatest(props.dataMap, 'CN_REAL_ESTATE_INVEST'));
const swiftLatest = computed(() => getLatest(props.dataMap, 'CN_SWIFT_CNY_SHARE'));

// ===== 房地产投资：按值正负判定描述与颜色 =====
// value < 0：持续承压（绿）；value >= 0：正增长（红）
const realEstateDesc = computed(() => {
  const v = realEstateLatest.value?.value;
  if (v == null) return '';
  return v < 0 ? '持续承压' : '正增长';
});
const realEstateColor = computed(() => {
  const v = realEstateLatest.value?.value;
  if (v == null) return undefined;
  return v < 0 ? '#16a34a' : '#dc2626';
});

// ===== 图表数据 =====
const retailData = computed(() => getSeries(props.dataMap, 'CN_RETAIL_SALES_YOY'));
const realEstateData = computed(() => getSeries(props.dataMap, 'CN_REAL_ESTATE_INVEST'));
const swiftData = computed(() => getSeries(props.dataMap, 'CN_SWIFT_CNY_SHARE'));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：3 张 MetricCard -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:8">
        <MetricCard
          label="社零同比"
          :value="retailLatest?.value ?? null"
          unit="%"
          :date="retailLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:8">
        <MetricCard
          label="房地产投资"
          :value="realEstateLatest?.value ?? null"
          unit="%"
          :desc="realEstateDesc"
          :color="realEstateColor"
          :date="realEstateLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:8">
        <MetricCard
          label="Swift 人民币占比"
          :value="swiftLatest?.value ?? null"
          unit="%"
          :date="swiftLatest?.report_date"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：图表网格（2 列，最后一张跨双列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">社会消费品零售总额同比</div>
          <div class="chart-box__sub">社零增速反映居民消费意愿，直接关系消费板块盈利</div>
          <RetailChart :data="retailData" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">房地产开发投资同比</div>
          <div class="chart-box__sub">地产投资影响产业链上下游，与建材、家电、银行板块相关</div>
          <RealEstateChart :data="realEstateData" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">Swift 人民币全球支付占比</div>
          <div class="chart-box__sub">人民币国际化提升 A 股外资配置需求，长期利好</div>
          <SwiftChart :data="swiftData" />
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
