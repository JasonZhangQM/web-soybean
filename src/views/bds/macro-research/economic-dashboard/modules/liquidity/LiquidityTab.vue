<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../MetricCard.vue';
import SfChart from './SfChart.vue';
import LoanChart from './LoanChart.vue';
import M1M2Chart from './M1M2Chart.vue';
import MoneySupplyChart from './MoneySupplyChart.vue';
import LprChart from './LprChart.vue';
import LiquidityComboChart from './LiquidityComboChart.vue';
import { getLatest, getSeries, calcM1M2 } from '../utils';

defineOptions({ name: 'LiquidityTab' });

/** 流动性与信用 Tab：7 张指标卡片 + 6 张图表 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值 =====
const sfLatest = computed(() => getLatest(props.dataMap, 'CN_SOCIAL_FINANCING_CUM'));
const loanLatest = computed(() => getLatest(props.dataMap, 'CN_NEW_RMB_LOANS_CUM'));
const m1Latest = computed(() => getLatest(props.dataMap, 'CN_M1_YOY'));
const m2Latest = computed(() => getLatest(props.dataMap, 'CN_M2_YOY'));
const m0Latest = computed(() => getLatest(props.dataMap, 'CN_M0_YOY'));
const lpr1yLatest = computed(() => getLatest(props.dataMap, 'CN_LPR_1Y'));

// ===== M1-M2 剪刀差（M1 同比 - M2 同比）=====
const m1m2Series = computed(() => {
  const m1 = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');
  return calcM1M2(m1, m2);
});
const m1m2Latest = computed(() => {
  const arr = m1m2Series.value;
  return arr.length ? arr[arr.length - 1] : null;
});
// 剪刀差 > 0：资金活化（红）；< 0：资金沉淀（绿）
const m1m2Desc = computed(() => {
  const v = m1m2Latest.value?.value;
  if (v == null) return '';
  return v > 0 ? '资金活化' : '资金沉淀';
});
const m1m2Color = computed(() => {
  const v = m1m2Latest.value?.value;
  if (v == null) return undefined;
  return v > 0 ? '#dc2626' : '#16a34a';
});

// ===== 图表数据 =====
const sfData = computed(() => getSeries(props.dataMap, 'CN_SOCIAL_FINANCING_CUM'));
const loanData = computed(() => getSeries(props.dataMap, 'CN_NEW_RMB_LOANS_CUM'));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：7 张 MetricCard -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="社融增量"
          :value="sfLatest?.value ?? null"
          unit="万亿元"
          :date="sfLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="新增贷款"
          :value="loanLatest?.value ?? null"
          unit="万亿元"
          :date="loanLatest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="M1 同比"
          :value="m1Latest?.value ?? null"
          unit="%"
          :date="m1Latest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="M2 同比"
          :value="m2Latest?.value ?? null"
          unit="%"
          :date="m2Latest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="M1-M2 剪刀差"
          :value="m1m2Latest?.value ?? null"
          unit="%"
          :desc="m1m2Desc"
          :color="m1m2Color"
          :date="m1m2Latest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="M0 同比"
          :value="m0Latest?.value ?? null"
          unit="%"
          :date="m0Latest?.report_date"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="1Y LPR"
          :value="lpr1yLatest?.value ?? null"
          unit="%"
          :date="lpr1yLatest?.report_date"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：图表网格（2 列，最后一张跨双列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">社融增量</div>
          <div class="chart-box__sub">社融是宽信用的核心指标，社融扩张利好 A 股估值提升</div>
          <SfChart :data="sfData" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">新增人民币贷款</div>
          <div class="chart-box__sub">新增贷款反映银行信用投放力度，是流动性的重要来源</div>
          <LoanChart :data="loanData" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">M1-M2 剪刀差</div>
          <div class="chart-box__sub">M1 增速 &gt; M2 表示资金活化利好股市，反之资金沉淀利空</div>
          <M1M2Chart :data="m1m2Series" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">M0/M1/M2 货币供应</div>
          <div class="chart-box__sub">货币供应增速反映央行政策取向，M2 增速与 A 股估值正相关</div>
          <MoneySupplyChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">LPR 1Y vs 5Y</div>
          <div class="chart-box__sub">1Y LPR 影响企业融资成本，5Y LPR 影响房贷与地产，降息利好 A 股</div>
          <LprChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">流动性综合视图</div>
          <div class="chart-box__sub">社融、M2、新增贷款综合对比，全面评估宏观流动性环境</div>
          <LiquidityComboChart :data-map="dataMap" />
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
