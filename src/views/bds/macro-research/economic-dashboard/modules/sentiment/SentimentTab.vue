<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../MetricCard.vue';
import MfgPmiChart from './MfgPmiChart.vue';
import SvcPmiChart from './SvcPmiChart.vue';
import AllPmiChart from './AllPmiChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'SentimentTab' });

/** 景气预期 Tab：4 张 PMI 指标卡片 + 3 张折线对比图 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各 PMI 指标最新值（数组已按 report_date 升序，最后一项为最新）=====
const officialMfgLatest = computed(() => getLatest(props.dataMap, 'CN_OFFICIAL_MFG_PMI'));
const ratingdogMfgLatest = computed(() => getLatest(props.dataMap, 'CN_RATINGDOG_MFG_PMI'));
const officialNonMfgLatest = computed(() => getLatest(props.dataMap, 'CN_OFFICIAL_NON_MFG_PMI'));
const ratingdogSvcLatest = computed(() => getLatest(props.dataMap, 'CN_RATINGDOG_SVC_PMI'));

/** PMI 区间判定：>=50 扩张（红），<50 收缩（绿）；无值时返回空描述 */
function pmiZone(value: number | null | undefined) {
  if (value == null) return { desc: '', color: undefined };
  return value >= 50
    ? { desc: '扩张区间', color: '#dc2626' }
    : { desc: '收缩区间', color: '#16a34a' };
}

const officialMfgZone = computed(() => pmiZone(officialMfgLatest.value?.value));
const ratingdogMfgZone = computed(() => pmiZone(ratingdogMfgLatest.value?.value));
const officialNonMfgZone = computed(() => pmiZone(officialNonMfgLatest.value?.value));
const ratingdogSvcZone = computed(() => pmiZone(ratingdogSvcLatest.value?.value));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张 PMI 指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="官方制造业 PMI"
          :value="officialMfgLatest?.value ?? null"
          :date="officialMfgLatest?.report_date"
          :desc="officialMfgZone.desc"
          :color="officialMfgZone.color"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="财新制造业 PMI"
          :value="ratingdogMfgLatest?.value ?? null"
          :date="ratingdogMfgLatest?.report_date"
          :desc="ratingdogMfgZone.desc"
          :color="ratingdogMfgZone.color"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="官方非制造业 PMI"
          :value="officialNonMfgLatest?.value ?? null"
          :date="officialNonMfgLatest?.report_date"
          :desc="officialNonMfgZone.desc"
          :color="officialNonMfgZone.color"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <MetricCard
          label="财新服务业 PMI"
          :value="ratingdogSvcLatest?.value ?? null"
          :date="ratingdogSvcLatest?.report_date"
          :desc="ratingdogSvcZone.desc"
          :color="ratingdogSvcZone.color"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：图表网格（2 列，最后一张跨双列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">官方 vs 财新制造业 PMI</div>
          <div class="chart-box__sub">PMI &gt; 50 制造业扩张利好周期股，&lt; 50 收缩需警惕</div>
          <MfgPmiChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">官方非制造业 vs 财新服务业 PMI</div>
          <div class="chart-box__sub">服务业 PMI 反映消费与服务业景气，影响消费板块</div>
          <SvcPmiChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">四大 PMI 全景</div>
          <div class="chart-box__sub">制造业+服务业 PMI 综合对比，全面评估经济景气预期</div>
          <AllPmiChart :data-map="dataMap" />
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
