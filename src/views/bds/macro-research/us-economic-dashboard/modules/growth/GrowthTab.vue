<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 growth/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
import GdpChart from './GdpChart.vue';
import BudgetChart from './BudgetChart.vue';
import GrowthComboChart from './GrowthComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'GrowthTab' });

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
const gdpLatest = computed(() => getLatest(props.dataMap, 'GDP_QOQ'));
const budgetLatest = computed(() => getLatest(props.dataMap, 'GOVERNMENT_BUDGET'));

// GDP 描述与颜色：≥2.0 高于潜在增速（红），<2.0 低于潜在增速（绿）
// value 类型定义为 number，但后端 nullable + Pydantic v2 可能序列化为 null/''/string，用 any 兜底
const gdpMeta = computed<{ desc?: string; color?: string }>(() => {
  const v: any = gdpLatest.value?.value;
  if (v == null || v === '') return {};
  const num = Number(v);
  if (!Number.isFinite(num)) return {};
  // 美国惯例红涨绿跌：高于潜在增速为红，低于为绿
  return num >= 2
    ? { desc: '高于潜在增速', color: '#dc2626' }
    : { desc: '低于潜在增速', color: '#16a34a' };
});

// 政府预算描述与颜色：<0 赤字（绿，财政改善方向），≥0 盈余（红）
const budgetMeta = computed<{ desc?: string; color?: string }>(() => {
  const v: any = budgetLatest.value?.value;
  if (v == null || v === '') return {};
  const num = Number(v);
  if (!Number.isFinite(num)) return {};
  // 赤字（负值）用绿，盈余（正值）用红，与 BudgetChart 正负着色语义一致
  return num < 0
    ? { desc: '赤字', color: '#16a34a' }
    : { desc: '盈余', color: '#dc2626' };
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：2 张指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:6">
        <MetricCard
          label="GDP季环比"
          :value="gdpLatest?.value ?? null"
          unit="%"
          :date="gdpLatest?.report_date"
          :desc="gdpMeta.desc"
          :color="gdpMeta.color"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
        <MetricCard
          label="政府预算"
          :value="budgetLatest?.value ?? null"
          unit="亿美元"
          :date="budgetLatest?.report_date"
          :desc="budgetMeta.desc"
          :color="budgetMeta.color"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：前 2 张图表各占 1 列，第 3 张综合图表跨双列 -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">GDP 季环比</div>
          <div class="chart-box__sub">GDP 季环比增速（%），≥2 蓝柱高于潜在增速，0~2 琥珀温和增长，&lt;0 红柱负增长</div>
          <GdpChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">政府预算</div>
          <div class="chart-box__sub">政府预算（亿美元），正值蓝柱盈余，负值橙柱赤字</div>
          <BudgetChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">GDP vs 零售销售 vs 耐用品订单</div>
          <div class="chart-box__sub">GDP 季环比柱状（左轴）+ 零售销售/耐用品订单标准化折线（右轴 0-100），以 GDP 日期为主轴对齐</div>
          <GrowthComboChart :data-map="dataMap" />
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
