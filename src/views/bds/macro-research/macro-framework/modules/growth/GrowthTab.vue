<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import GrowthChart from './GrowthChart.vue';
import InvestChart from './InvestChart.vue';
import InvestRealChart from './InvestRealChart.vue';
import TradeChart from '../../../_shared/TradeChart.vue';
import { getLatest } from '../../../_shared/utils';

defineOptions({ name: 'GrowthTab' });

/**
 * 维度一：经济增长
 * 6 张时序属性指标卡片（先行/一致/滞后）+ 2 张同比走势图
 * 注：城镇失业率属劳动力维度，已在③ 劳动力 Tab 展示
 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值（用于顶部卡片） =====
const gdpLatest = computed(() => getLatest(props.dataMap, 'CN_GDP_YOY'));
const ivaLatest = computed(() => getLatest(props.dataMap, 'CN_INDUSTRIAL_VALUE_ADDED_YOY'));
const profitLatest = computed(() => getLatest(props.dataMap, 'CN_INDUSTRIAL_PROFIT_YOY'));
const retailLatest = computed(() => getLatest(props.dataMap, 'CN_RETAIL_SALES_YOY'));
const realEstateLatest = computed(() => getLatest(props.dataMap, 'CN_REAL_ESTATE_INVEST'));
const urbanInvestLatest = computed(() => getLatest(props.dataMap, 'CN_URBAN_FIXED_ASSET_INVEST_YOY'));

// 同比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：6 张指标卡片（大屏单行排列） -->
    <NGrid cols="1 s:2 m:3 l:6" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi>
        <FwMetricCard
          label="GDP 同比"
          :value="gdpLatest?.value ?? null"
          unit="%"
          desc="盈利根基"
          timing="一致"
          :date="gdpLatest?.report_date"
          :change="computeChange(gdpLatest)"
        />
      </NGi>
      <NGi>
        <FwMetricCard
          label="工业增加值"
          :value="ivaLatest?.value ?? null"
          unit="%"
          desc="生产活跃度"
          timing="一致"
          :date="ivaLatest?.report_date"
          :change="computeChange(ivaLatest)"
        />
      </NGi>
      <NGi>
        <FwMetricCard
          label="工业利润"
          :value="profitLatest?.value ?? null"
          unit="%"
          desc="决定A股盈利增速"
          timing="滞后"
          :date="profitLatest?.report_date"
          :change="computeChange(profitLatest)"
        />
      </NGi>
      <NGi>
        <FwMetricCard
          label="社零同比"
          :value="retailLatest?.value ?? null"
          unit="%"
          desc="消费意愿"
          timing="一致"
          :date="retailLatest?.report_date"
          :change="computeChange(retailLatest)"
        />
      </NGi>
      <NGi>
        <FwMetricCard
          label="房地产投资"
          :value="realEstateLatest?.value ?? null"
          unit="%"
          desc="影响产业链上下游"
          timing="一致"
          :date="realEstateLatest?.report_date"
          :change="computeChange(realEstateLatest)"
        />
      </NGi>
      <NGi>
        <FwMetricCard
          label="城镇固投"
          :value="urbanInvestLatest?.value ?? null"
          unit="%"
          desc="整体投资强度"
          timing="一致"
          :date="urbanInvestLatest?.report_date"
          :change="computeChange(urbanInvestLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：2 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">GDP、工业增加值、城镇固投与社零同比</div>
          <GrowthChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">工业增加值与工业利润同比</div>
          <InvestChart :data-map="dataMap" />
        </div>
      </NGi>
    </NGrid>

    <!-- 第 3 行：2 张图表（2 列布局） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mt-16px">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">城镇固投与房地产投资同比</div>
          <InvestRealChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">进出口走势与贸易顺差</div>
          <TradeChart :data-map="dataMap" />
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
  margin-bottom: 12px;
}
</style>
