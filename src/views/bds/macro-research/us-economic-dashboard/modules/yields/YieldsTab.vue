<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 yields/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import YieldCompareChart from './YieldCompareChart.vue';
import SpreadChart from './SpreadChart.vue';
import YieldComboChart from './YieldComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'YieldsTab' });

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
const y2Latest = computed(() => getLatest(props.dataMap, 'YIELD_2Y'));
const y10Latest = computed(() => getLatest(props.dataMap, 'YIELD_10Y'));
const spreadLatest = computed(() => getLatest(props.dataMap, 'YIELD_SPREAD_2Y10Y'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// 利差状态：倒挂（<0，红色）/ 正常（≥0，绿色）
const spreadStatus = computed(() => {
  if (!spreadLatest.value || spreadLatest.value.value == null) return null;
  const v = Number(spreadLatest.value.value);
  // 收益率曲线倒挂：2Y > 10Y，即 2Y-10Y 利差 < 0
  if (v < 0) return { desc: '倒挂', color: '#dc2626' };
  return { desc: '正常', color: '#16a34a' };
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：3 张指标卡片（2Y / 10Y / 2Y-10Y利差） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="8 s:12 m:8 l:8">
        <MetricCard
          label="2年期美债收益率"
          :value="y2Latest?.value ?? null"
          unit="%"
          :date="y2Latest?.report_date"
          :change="computeChange(y2Latest)"
        />
      </NGi>
      <NGi span="8 s:12 m:8 l:8">
        <MetricCard
          label="10年期美债收益率"
          :value="y10Latest?.value ?? null"
          unit="%"
          :date="y10Latest?.report_date"
          :change="computeChange(y10Latest)"
        />
      </NGi>
      <NGi span="8 s:12 m:8 l:8">
        <MetricCard
          label="2Y-10Y利差"
          :value="spreadLatest?.value ?? null"
          unit="%"
          :date="spreadLatest?.report_date"
          :desc="spreadStatus?.desc"
          :color="spreadStatus?.color"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 列布局，前 2 张图表各占 1 列，第 3 张综合图表跨双列 -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">2年期 vs 10年期美债收益率</div>
          <div class="chart-box__sub">2Y（蓝）与 10Y（红）日频收益率双折线对比，以 10Y 日期为主轴对齐 2Y</div>
          <YieldCompareChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">2Y-10Y 利差</div>
          <div class="chart-box__sub">2Y-10Y 利差柱状图，正值蓝柱、负值红柱，含 0 倒挂线（虚线灰色）</div>
          <SpreadChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">2Y + 10Y 收益率 vs 2Y-10Y 利差</div>
          <div class="chart-box__sub">双轴综合视图：左轴 2Y/10Y 收益率折线，右轴 2Y-10Y 利差柱状（按正负着色）</div>
          <YieldComboChart :data-map="dataMap" />
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
