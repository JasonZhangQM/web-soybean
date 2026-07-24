<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import InfoCard from '../InfoCard.vue';
import InflationChart from './InflationChart.vue';
import UnemploymentChart from '../labor/UnemploymentChart.vue';
import { getLatest, getSeries, calcScissors } from '../../../_shared/utils';

defineOptions({ name: 'InflationTab' });

/**
 * 维度二：通胀与就业
 * 第 1 行：4 张指标卡片（CPI / PPI / 剪刀差 / 城镇调查失业率）
 * 第 2 行：通胀走势图 + 失业率走势图（两列并排）
 * 第 3 行：劳动力市场待补充指标说明
 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== CPI / PPI 最新值（用于顶部卡片） =====
const cpiLatest = computed(() => getLatest(props.dataMap, 'CN_CPI_YOY'));
const ppiLatest = computed(() => getLatest(props.dataMap, 'CN_PPI_YOY'));

// ===== CPI-PPI 剪刀差：CPI 同比 - PPI 同比，按 report_date 对齐 =====
const cpiSeries = computed(() => getSeries(props.dataMap, 'CN_CPI_YOY'));
const ppiSeries = computed(() => getSeries(props.dataMap, 'CN_PPI_YOY'));
const scissorsSeries = computed(() => calcScissors(cpiSeries.value, ppiSeries.value));
const scissorsLatest = computed(() => {
  const arr = scissorsSeries.value;
  return arr.length ? arr[arr.length - 1] : null;
});

// ===== 城镇调查失业率 =====
const UNEMPLOYMENT_CODE = 'CN_URBAN_UNEMPLOYMENT';
const unemploymentLatest = computed(() => getLatest(props.dataMap, UNEMPLOYMENT_CODE));
const unemploymentData = computed(() => getSeries(props.dataMap, UNEMPLOYMENT_CODE));
// 环比变化 = 当前值 - 上一期值
const unemploymentChange = computed<number | null>(() => {
  const list = unemploymentData.value;
  if (!list || list.length < 2) return null;
  const cur = Number(list[list.length - 1].value);
  const prev = Number(list[list.length - 2].value);
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  return +(cur - prev).toFixed(2);
});

// 同比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

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

// 劳动力市场待补充指标说明
const pendingItems = [
  { name: '城镇新增就业', desc: '反映企业用工意愿，比GDP更早转折' },
  { name: '平均工资增速', desc: '工资-价格螺旋是通胀的独立驱动力' },
  { name: '劳动参与率', desc: '结构性变量，受人口、教育、退休政策影响' },
  { name: '求人倍率', desc: '岗位空缺/求职人数，反映结构性错配' }
];
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张指标卡片（CPI / PPI / 剪刀差 / 失业率） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:6">
        <FwMetricCard
          label="CPI 同比"
          :value="cpiLatest?.value ?? null"
          unit="%"
          desc="下游消费价格"
          timing="滞后"
          :date="cpiLatest?.report_date"
          :change="computeChange(cpiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
        <FwMetricCard
          label="PPI 同比"
          :value="ppiLatest?.value ?? null"
          unit="%"
          desc="上游工业品价格"
          timing="先行"
          :date="ppiLatest?.report_date"
          :change="computeChange(ppiLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
        <FwMetricCard
          label="CPI-PPI 剪刀差"
          :value="scissorsLatest?.value ?? null"
          unit="%"
          timing="先行"
          :date="scissorsLatest?.report_date"
          :desc="scissorsDesc"
          :color="scissorsColor"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
        <FwMetricCard
          label="城镇调查失业率"
          :value="unemploymentLatest?.value ?? null"
          unit="%"
          desc="劳动力市场闲置程度"
          :change="unemploymentChange"
          timing="滞后"
          :date="unemploymentLatest?.report_date"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：通胀走势图 + 失业率走势图（两列并排） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mb-16px">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">CPI、PPI 同比与 CPI-PPI 剪刀差</div>
          <InflationChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">城镇调查失业率走势</div>
          <UnemploymentChart :data="unemploymentData" />
        </div>
      </NGi>
    </NGrid>

    <!-- 第 3 行：劳动力市场待补充指标说明（跨全宽，两列） -->
    <InfoCard
      title="劳动力市场待补充指标"
      badge="数据待补充"
      :items="pendingItems"
      :columns="2"
    />
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
  margin-bottom: 12px;
}
</style>
