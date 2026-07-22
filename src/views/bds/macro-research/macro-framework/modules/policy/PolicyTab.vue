<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import LiquidityComboChart from '../../../economic-dashboard/modules/liquidity/LiquidityComboChart.vue';
import LprChart from '../../../economic-dashboard/modules/liquidity/LprChart.vue';
import { getLatest, getSeries, calcM1M2 } from '../../../economic-dashboard/modules/utils';

defineOptions({ name: 'PolicyTab' });

/** 维度五：政策环境 Tab —— 6 张指标卡片 + 2 张图表（流动性综合视图、LPR） */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值（数组按 report_date 升序，最后一项为最新）=====
const sfLatest = computed(() => getLatest(props.dataMap, 'CN_SOCIAL_FINANCING_CUM'));
const loanLatest = computed(() => getLatest(props.dataMap, 'CN_NEW_RMB_LOANS_CUM'));
const m1Latest = computed(() => getLatest(props.dataMap, 'CN_M1_YOY'));
const m2Latest = computed(() => getLatest(props.dataMap, 'CN_M2_YOY'));
const lpr1yLatest = computed(() => getLatest(props.dataMap, 'CN_LPR_1Y'));

// ===== M1-M2 剪刀差（M1 同比 - M2 同比）=====
const m1m2Series = computed(() => {
  const m1 = getSeries(props.dataMap, 'CN_M1_YOY');
  const m2 = getSeries(props.dataMap, 'CN_M2_YOY');
  return calcM1M2(m1, m2);
});
// 取计算结果最后一条作为最新值，date 同步取该条 report_date
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
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：6 张 FwMetricCard，全部 timing="先行" -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="社融增量"
          :value="sfLatest?.value ?? null"
          unit="亿元"
          :date="sfLatest?.report_date"
          timing="先行"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="新增贷款"
          :value="loanLatest?.value ?? null"
          unit="亿元"
          :date="loanLatest?.report_date"
          timing="先行"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="M1同比"
          :value="m1Latest?.value ?? null"
          unit="%"
          :date="m1Latest?.report_date"
          timing="先行"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="M2同比"
          :value="m2Latest?.value ?? null"
          unit="%"
          :date="m2Latest?.report_date"
          timing="先行"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="M1-M2剪刀差"
          :value="m1m2Latest?.value ?? null"
          unit="%"
          :desc="m1m2Desc"
          :color="m1m2Color"
          :date="m1m2Latest?.report_date"
          timing="先行"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <FwMetricCard
          label="1Y LPR"
          :value="lpr1yLatest?.value ?? null"
          unit="%"
          :date="lpr1yLatest?.report_date"
          timing="先行"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 张图表（2 列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">流动性综合视图</div>
          <div class="chart-box__sub">社融、新增贷款（左轴亿元）与M1、M2、M1-M2剪刀差（右轴%）综合对比</div>
          <LiquidityComboChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">LPR 1Y vs 5Y</div>
          <div class="chart-box__sub">1Y影响企业融资成本，5Y影响房贷与地产</div>
          <LprChart :data-map="dataMap" />
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
