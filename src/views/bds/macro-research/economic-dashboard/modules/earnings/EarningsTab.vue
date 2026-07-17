<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../MetricCard.vue';
import IvaChart from './IvaChart.vue';
import ScissorsChart from './ScissorsChart.vue';
import { getLatest, getSeries, calcScissors } from '../utils';

defineOptions({ name: 'EarningsTab' });

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
const gdpLatest = computed(() => getLatest(props.dataMap, 'CN_GDP_YOY'));
const ivaLatest = computed(() => getLatest(props.dataMap, 'CN_INDUSTRIAL_VALUE_ADDED_YOY'));
const profitLatest = computed(() => getLatest(props.dataMap, 'CN_INDUSTRIAL_PROFIT_YOY'));
const cpiLatest = computed(() => getLatest(props.dataMap, 'CN_CPI_YOY'));
const ppiLatest = computed(() => getLatest(props.dataMap, 'CN_PPI_YOY'));

// ===== CPI-PPI 剪刀差 =====
const cpiSeries = computed(() => getSeries(props.dataMap, 'CN_CPI_YOY'));
const ppiSeries = computed(() => getSeries(props.dataMap, 'CN_PPI_YOY'));
const scissorsSeries = computed(() => calcScissors(cpiSeries.value, ppiSeries.value));
const scissorsLatest = computed(() => {
  const arr = scissorsSeries.value;
  return arr.length ? arr[arr.length - 1] : null;
});

// ===== 各图表时序数据 =====
// 同比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// 工业利润：value >= 0 红色「正增长」，< 0 绿色「负增长」
const profitDesc = computed(() => {
  const v = profitLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 0 ? '正增长' : '负增长';
});
const profitColor = computed(() => {
  const v = profitLatest.value?.value;
  if (v == null) return undefined;
  return Number(v) >= 0 ? '#dc2626' : '#16a34a';
});

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
    <!-- 第 1 行：6 张指标卡片（大屏单行排列，参考流动性与信用页面） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="GDP 同比"
          :value="gdpLatest?.value ?? null"
          unit="%"
          :date="gdpLatest?.report_date"
          :change="computeChange(gdpLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="CPI 同比"
          :value="cpiLatest?.value ?? null"
          unit="%"
          :date="cpiLatest?.report_date"
          :change="computeChange(cpiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="PPI 同比"
          :value="ppiLatest?.value ?? null"
          unit="%"
          :date="ppiLatest?.report_date"
          :change="computeChange(ppiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="CPI-PPI 剪刀差"
          :value="scissorsLatest?.value ?? null"
          unit="%"
          :date="scissorsLatest?.report_date"
          :desc="scissorsDesc"
          :color="scissorsColor"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="工业增加值"
          :value="ivaLatest?.value ?? null"
          unit="%"
          :date="ivaLatest?.report_date"
          :change="computeChange(ivaLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="工业利润"
          :value="profitLatest?.value ?? null"
          unit="%"
          :date="profitLatest?.report_date"
          :change="computeChange(profitLatest)"
          :desc="profitDesc"
          :color="profitColor"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 张图表（2 列布局） -->
    <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">GDP、CPI/PPI 同比与剪刀差</div>
          <div class="chart-box__sub">GDP 增速为盈利根基；CPI、PPI 同比与 CPI-PPI 剪刀差，剪刀差 &gt; 0 下游受益，&lt; 0 上游受益</div>
          <ScissorsChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">工业增加值、工业利润与 PPI 同比</div>
          <div class="chart-box__sub">工业增加值增速反映生产活跃度，工业利润直接决定 A 股盈利增速，PPI 反映工业品出厂价格对利润的传导</div>
          <IvaChart :data-map="dataMap" />
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
