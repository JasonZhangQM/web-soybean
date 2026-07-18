<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板的 MetricCard 组件
// 注：inflation/ 目录下需向上 3 级到达 macro-research/，再进入 economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import CpiChart from './CpiChart.vue';
import PceYoYChart from './PceYoYChart.vue';
import PceMomChart from './PceMomChart.vue';
import PpiChart from './PpiChart.vue';
import MichiganChart from './MichiganChart.vue';
import InflationAllChart from './InflationAllChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'InflationTab' });

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
const cpiYoYLatest = computed(() => getLatest(props.dataMap, 'CPI_YOY'));
const cpiMomLatest = computed(() => getLatest(props.dataMap, 'CPI_MOM'));
const coreCpiYoYLatest = computed(() => getLatest(props.dataMap, 'CORE_CPI_YOY'));
const coreCpiMomLatest = computed(() => getLatest(props.dataMap, 'CORE_CPI_MOM'));
const pceYoYLatest = computed(() => getLatest(props.dataMap, 'PCE_YOY'));
const pceMomLatest = computed(() => getLatest(props.dataMap, 'PCE_MOM'));
const corePceYoYLatest = computed(() => getLatest(props.dataMap, 'CORE_PCE_YOY'));
const corePceMomLatest = computed(() => getLatest(props.dataMap, 'CORE_PCE_MOM'));
const ppiYoYLatest = computed(() => getLatest(props.dataMap, 'PPI_YOY'));
const michigan5YLatest = computed(() => getLatest(props.dataMap, 'MICHIGAN_5Y_INFLATION_EXPECTATION'));
const michigan1YLatest = computed(() => getLatest(props.dataMap, 'MICHIGAN_1Y_INFLATION_EXPECTATION'));

// 同比/环比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// 核心 PCE 同比：值 >= 2「高于 2% 目标」，< 2「低于 2% 目标」
const corePceDesc = computed(() => {
  const v = corePceYoYLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 2 ? '高于 2% 目标' : '低于 2% 目标';
});
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：11 张指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="CPI同比"
          :value="cpiYoYLatest?.value ?? null"
          unit="%"
          :date="cpiYoYLatest?.report_date"
          :change="computeChange(cpiYoYLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="CPI月率"
          :value="cpiMomLatest?.value ?? null"
          unit="%"
          :date="cpiMomLatest?.report_date"
          :change="computeChange(cpiMomLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="核心CPI同比"
          :value="coreCpiYoYLatest?.value ?? null"
          unit="%"
          :date="coreCpiYoYLatest?.report_date"
          :change="computeChange(coreCpiYoYLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="核心CPI月率"
          :value="coreCpiMomLatest?.value ?? null"
          unit="%"
          :date="coreCpiMomLatest?.report_date"
          :change="computeChange(coreCpiMomLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="PCE同比"
          :value="pceYoYLatest?.value ?? null"
          unit="%"
          :date="pceYoYLatest?.report_date"
          :change="computeChange(pceYoYLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="PCE环比"
          :value="pceMomLatest?.value ?? null"
          unit="%"
          :date="pceMomLatest?.report_date"
          :change="computeChange(pceMomLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="核心PCE同比"
          :value="corePceYoYLatest?.value ?? null"
          unit="%"
          :date="corePceYoYLatest?.report_date"
          :change="computeChange(corePceYoYLatest)"
          :desc="corePceDesc"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="核心PCE环比"
          :value="corePceMomLatest?.value ?? null"
          unit="%"
          :date="corePceMomLatest?.report_date"
          :change="computeChange(corePceMomLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="PPI同比"
          :value="ppiYoYLatest?.value ?? null"
          unit="%"
          :date="ppiYoYLatest?.report_date"
          :change="computeChange(ppiYoYLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="密歇根5年通胀预期"
          :value="michigan5YLatest?.value ?? null"
          unit="%"
          :date="michigan5YLatest?.report_date"
          :change="computeChange(michigan5YLatest)"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="密歇根1年通胀预期"
          :value="michigan1YLatest?.value ?? null"
          unit="%"
          :date="michigan1YLatest?.report_date"
          :change="computeChange(michigan1YLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：6 张图表（2 列布局，最后一张跨双列） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">CPI 同比 vs 核心CPI 同比</div>
          <div class="chart-box__sub">CPI 含食品能源波动，核心 CPI 剔除食品能源更能反映底层通胀趋势</div>
          <CpiChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">PCE 同比 vs 核心PCE 同比</div>
          <div class="chart-box__sub">美联储首选通胀指标，2% 为长期政策目标，核心 PCE 剔除食品能源</div>
          <PceYoYChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">PCE 环比 vs 核心PCE 环比</div>
          <div class="chart-box__sub">环比反映短期通胀动能，核心 PCE 环比剔除食品能源后的月度变化</div>
          <PceMomChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">PPI 同比</div>
          <div class="chart-box__sub">生产者价格指数反映上游工业品出厂价格，是 CPI 的先行传导指标</div>
          <PpiChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">密歇根通胀预期（5年 vs 1年）</div>
          <div class="chart-box__sub">消费者通胀预期调查，5 年预期锚定长期通胀可信度，1 年预期反映短期看法</div>
          <MichiganChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">通胀指标全景对比</div>
          <div class="chart-box__sub">CPI / 核心 CPI / PCE / 核心 PCE / PPI 同比叠加；PCE 环比与核心 PCE 环比乘 12 年化（虚线）</div>
          <InflationAllChart :data-map="dataMap" />
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
