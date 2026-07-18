<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板的 OvCard 组件，避免代码重复
import OvCard from '../../../economic-dashboard/modules/overview/OvCard.vue';
import InflationTrendChart from './InflationTrendChart.vue';
import EmploymentCoreChart from './EmploymentCoreChart.vue';
import MfgPmiChart from './MfgPmiChart.vue';
import FedRateChart from './FedRateChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'OverviewTab' });

/**
 * 美国宏观看板 - 总览 Tab
 * 两行布局：3 张核心指标大卡片（通胀锚/就业健康度/增长动能） + 4 张图表（2×2）
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 第 1 行：3 张 OvCard 数据 =====

// 卡片 1：核心PCE同比（通胀锚）
const corePceLatest = computed(() => getLatest(props.dataMap, 'CORE_PCE_YOY'));
// 卡片 2：失业率（就业健康度）
const unempLatest = computed(() => getLatest(props.dataMap, 'UNEMPLOYMENT_RATE'));
// 卡片 3：GDP季环比（增长动能）
const gdpLatest = computed(() => getLatest(props.dataMap, 'GDP_QOQ'));

// 核心 PCE 区间判断：>=2 高于 2% 目标，<2 低于 2% 目标
const corePceDesc = computed(() => {
  const v = corePceLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 2 ? '高于 2% 目标' : '低于 2% 目标';
});

// 失业率区间判断：>=4.2 高于自然率，<4.2 低于自然率
const unempDesc = computed(() => {
  const v = unempLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 4.2 ? '高于自然率' : '低于自然率';
});

// GDP 区间判断：>=2 高于潜在增速，<2 低于潜在增速
const gdpDesc = computed(() => {
  const v = gdpLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 2 ? '高于潜在增速' : '低于潜在增速';
});

// 格式化日期为 YYYY-MM
function fmtDate(d?: string | null) {
  if (!d) return '';
  return d.slice(0, 7);
}
</script>

<template>
  <div class="overview-tab">
    <NSpin :show="loading">
      <!-- 第 1 行：3 张核心指标大卡片 -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16" class="mb-16px">
        <NGi span="24 s:12 m:12 l:8">
          <OvCard
            label="核心PCE同比"
            sub="通胀锚"
            :value="corePceLatest?.value ?? null"
            unit="%"
            color="#dc2626"
            :date="fmtDate(corePceLatest?.report_date)"
            :desc="corePceDesc"
          />
        </NGi>
        <NGi span="24 s:12 m:12 l:8">
          <OvCard
            label="失业率"
            sub="就业健康度"
            :value="unempLatest?.value ?? null"
            unit="%"
            color="#16a34a"
            :date="fmtDate(unempLatest?.report_date)"
            :desc="unempDesc"
          />
        </NGi>
        <NGi span="24 s:12 m:12 l:8">
          <OvCard
            label="GDP季环比"
            sub="增长动能"
            :value="gdpLatest?.value ?? null"
            unit="%"
            color="#2563eb"
            :date="fmtDate(gdpLatest?.report_date)"
            :desc="gdpDesc"
          />
        </NGi>
      </NGrid>

      <!-- 第 2 行：2×2 图表网格 -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16">
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">通胀趋势全景</div>
            <div class="chart-box__sub">CPI同比 + 核心CPI同比 + PPI同比（三折线）</div>
            <InflationTrendChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">就业市场核心</div>
            <div class="chart-box__sub">失业率（左轴折线）+ 非农就业（右轴柱状）双轴</div>
            <EmploymentCoreChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">制造业景气度</div>
            <div class="chart-box__sub">ISM制造业 + ISM非制造业（50荣枯线参考线）</div>
            <MfgPmiChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">联邦基金利率</div>
            <div class="chart-box__sub">利率上限 + 利率下限（双折线，区间填充）</div>
            <FedRateChart :data-map="dataMap" />
          </div>
        </NGi>
      </NGrid>
    </NSpin>
  </div>
</template>

<style scoped>
.overview-tab {
  width: 100%;
}

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
