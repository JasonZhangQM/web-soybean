<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 employment/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
import NfpAdpChart from './NfpAdpChart.vue';
import UnemploymentChart from './UnemploymentChart.vue';
import JoltsChart from './JoltsChart.vue';
import EmploymentComboChart from './EmploymentComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'EmploymentTab' });

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
const nfpLatest = computed(() => getLatest(props.dataMap, 'NONFARM_PAYROLL'));
const adpLatest = computed(() => getLatest(props.dataMap, 'ADP_EMPLOYMENT_CHANGE'));
const ueLatest = computed(() => getLatest(props.dataMap, 'UNEMPLOYMENT_RATE'));
const joltsLatest = computed(() => getLatest(props.dataMap, 'JOLTS_JOB_OPENINGS'));
const claimsLatest = computed(() => getLatest(props.dataMap, 'INITIAL_JOBLESS_CLAIMS'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// 失业率描述：≥4.2 「高于自然率」，<4.2 「低于自然率」
const ueDesc = computed(() => {
  const v = ueLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 4.2 ? '高于自然率' : '低于自然率';
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：5 张指标卡片（大屏单行排列，l 断点 5*4=20 ≤ 24） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="非农就业新增"
          :value="nfpLatest?.value ?? null"
          unit="万人"
          :date="nfpLatest?.report_date"
          :change="computeChange(nfpLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="ADP 就业变动"
          :value="adpLatest?.value ?? null"
          unit="万人"
          :date="adpLatest?.report_date"
          :change="computeChange(adpLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="失业率"
          :value="ueLatest?.value ?? null"
          unit="%"
          :date="ueLatest?.report_date"
          :change="computeChange(ueLatest)"
          :desc="ueDesc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="JOLTS 职位空缺"
          :value="joltsLatest?.value ?? null"
          unit="万人"
          :date="joltsLatest?.report_date"
          :change="computeChange(joltsLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="初请失业金"
          :value="claimsLatest?.value ?? null"
          unit="万人"
          :date="claimsLatest?.report_date"
          :change="computeChange(claimsLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：4 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">非农就业 vs ADP 就业</div>
          <div class="chart-box__sub">非农就业（BLS）与 ADP（私营部门）双柱对比，验证就业市场趋势一致性</div>
          <NfpAdpChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">失业率走势</div>
          <div class="chart-box__sub">U-3 失业率时序，4.2% 为长期自然率参考线</div>
          <UnemploymentChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">JOLTS 职位空缺</div>
          <div class="chart-box__sub">职位空缺数反映劳动力市场需求强度，与失业率负相关</div>
          <JoltsChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">就业市场综合视图</div>
          <div class="chart-box__sub">失业率（左轴折线）+ 非农就业新增（右轴柱状），双视角观察就业市场</div>
          <EmploymentComboChart :data-map="dataMap" />
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
