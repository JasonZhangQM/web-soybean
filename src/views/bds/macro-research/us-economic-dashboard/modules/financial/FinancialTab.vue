<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 financial/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
// 跨目录复用原 policy/ 目录下的政策利率图表（合并 Tab 后保留图表，避免重复实现）
import FedRateRangeChart from '../policy/FedRateRangeChart.vue';
import RateVsPceChart from '../policy/RateVsPceChart.vue';
// 跨目录复用原 yields/ 目录下的收益率图表
import YieldCompareChart from '../yields/YieldCompareChart.vue';
import SpreadChart from '../yields/SpreadChart.vue';
import YieldComboChart from '../yields/YieldComboChart.vue';
import YieldTipsChart from '../yields/YieldTipsChart.vue';
// 注意：两个 utils.ts 都导出 getLatest，但操作类型不同
// - ../utils 操作 EconomicIndicator（政策利率，父注入 dataMap）
// - ../yields/utils 操作 DailyIndicator（收益率，组件内 yieldsDataMap）
import { getLatest as getLatestEconomic } from '../utils';
import { getLatest as getLatestDaily } from '../yields/utils';

defineOptions({ name: 'FinancialTab' });

/**
 * 金融 Tab：合并原 货币政策（政策利率）+ 美债收益（收益率指标）
 * 两套数据流均由父组件注入：
 * - 政策利率：dataMap（EconomicIndicator 类型），与其他经济指标 Tab 共享
 * - 收益率：yieldsDataMap（DailyIndicator 类型），由父组件统一拉取，同步功能在顶部筛选区
 */
interface Props {
  /** 政策利率指标数据 Map（indicator_code -> 升序时序数组），由父组件统一拉取注入 */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 日期范围（YYYY-MM-DD 格式字符串元组），由父组件统一控制（保留兼容，本组件不再直接使用） */
  dateRange: [string, string] | null;
  /** 政策利率数据加载状态（父组件拉取中） */
  loading?: boolean;
  /** 收益率指标数据 Map（由父组件统一拉取注入，DailyIndicator 类型） */
  yieldsDataMap: Map<string, Api.Bds.DailyIndicator[]>;
  /** 收益率数据加载状态（父组件拉取中） */
  yieldsLoading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false, yieldsLoading: false });

// ===== 政策利率卡片最新值（基于父注入 dataMap，EconomicIndicator 类型）=====
const lowerLatest = computed(() => getLatestEconomic(props.dataMap, 'FED_FUNDS_RATE'));
const upperLatest = computed(() => getLatestEconomic(props.dataMap, 'FED_FUNDS_RATE_UPPER'));

/**
 * 政策利率环比变化：value - value_prev（value_prev 为 null 时返回 null）
 * EconomicIndicator 自带 value_prev 字段，直接使用
 */
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

// ===== 收益率卡片最新值（基于父注入 yieldsDataMap，DailyIndicator 类型）=====
const y2Latest = computed(() => getLatestDaily(props.yieldsDataMap, 'YIELD_2Y'));
const y10Latest = computed(() => getLatestDaily(props.yieldsDataMap, 'YIELD_10Y'));
const spreadLatest = computed(() => getLatestDaily(props.yieldsDataMap, 'YIELD_SPREAD_10Y2Y'));
const tipsLatest = computed(() => getLatestDaily(props.yieldsDataMap, 'YIELD_TIPS_10Y'));

/**
 * 收益率环比变化：当前 value - 前一条非 null 记录的 value
 * DailyIndicator 无 value_prev 字段，从 yieldsDataMap 中取前一条记录计算
 */
function computeChangeFromPrev(code: string): number | null {
  const list = props.yieldsDataMap.get(code);
  if (!list || list.length < 2) return null;
  // 从尾部向前找最新一条非 null 记录
  let latestIdx = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].value != null) {
      latestIdx = i;
      break;
    }
  }
  if (latestIdx <= 0) return null;
  // 找上一条非 null 记录
  let prevIdx = -1;
  for (let i = latestIdx - 1; i >= 0; i--) {
    if (list[i].value != null) {
      prevIdx = i;
      break;
    }
  }
  if (prevIdx < 0) return null;
  return Number(list[latestIdx].value) - Number(list[prevIdx].value);
}

// 利差状态：倒挂（<0，红色）/ 正常（≥0，绿色）
const spreadStatus = computed(() => {
  if (!spreadLatest.value || spreadLatest.value.value == null) return null;
  const v = Number(spreadLatest.value.value);
  // 收益率曲线倒挂：2Y > 10Y，即 10Y-2Y 利差 < 0
  if (v < 0) return { desc: '倒挂', color: '#dc2626' };
  return { desc: '正常', color: '#16a34a' };
});
</script>

<template>
  <div class="pb-12px">
    <!-- 双数据源加载：政策利率用父组件 loading，收益率用父组件 yieldsLoading -->
    <NSpin :show="loading || yieldsLoading">
      <!-- 第 1 行：6 张指标卡片（大屏单行排列，l 断点 6*4=24） -->
      <!-- 前 2 张为政策利率（EconomicIndicator），后 4 张为收益率（DailyIndicator） -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="利率下限"
            :value="lowerLatest?.value ?? null"
            unit="%"
            :date="lowerLatest?.report_date"
            :change="computeChange(lowerLatest)"
          />
        </NGi>
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="利率上限"
            :value="upperLatest?.value ?? null"
            unit="%"
            :date="upperLatest?.report_date"
            :change="computeChange(upperLatest)"
          />
        </NGi>
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="2年期美债收益率"
            :value="y2Latest?.value ?? null"
            unit="%"
            :date="y2Latest?.report_date"
            :change="computeChangeFromPrev('YIELD_2Y')"
          />
        </NGi>
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="10年期美债收益率"
            :value="y10Latest?.value ?? null"
            unit="%"
            :date="y10Latest?.report_date"
            :change="computeChangeFromPrev('YIELD_10Y')"
          />
        </NGi>
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="10Y-2Y利差"
            :value="spreadLatest?.value ?? null"
            unit="%"
            :date="spreadLatest?.report_date"
            :desc="spreadStatus?.desc"
            :color="spreadStatus?.color"
          />
        </NGi>
        <NGi span="12 s:12 m:8 l:4">
          <MetricCard
            label="10年期TIPS"
            :value="tipsLatest?.value ?? null"
            unit="%"
            :date="tipsLatest?.report_date"
          />
        </NGi>
      </NGrid>

      <!-- 第 2 行起：6 张图表，政策利率类用 dataMap，收益率类用 yieldsDataMap -->
      <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
        <!-- 联邦基金利率区间（跨双列，数据来自父注入 EconomicIndicator dataMap） -->
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">联邦基金利率区间</div>
            <div class="chart-box__sub">FOMC 利率决策上限（红）与下限（蓝），上下限之间区间填充，反映政策利率走廊</div>
            <FedRateRangeChart :data-map="dataMap" />
          </div>
        </NGi>
        <!-- 利率 vs 核心 PCE（跨双列，数据来自父注入 EconomicIndicator dataMap） -->
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">利率 vs 核心 PCE</div>
            <div class="chart-box__sub">左轴利率上下限（红/蓝）+ 右轴核心 PCE 同比（绿），观察政策利率与核心通胀的关系</div>
            <RateVsPceChart :data-map="dataMap" />
          </div>
        </NGi>
        <!-- 2年期 vs 10年期美债收益率（半宽，数据来自组件内 DailyIndicator yieldsDataMap） -->
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">2年期 vs 10年期美债收益率</div>
            <div class="chart-box__sub">2Y（蓝）与 10Y（红）日频收益率双折线对比，以 10Y 日期为主轴对齐 2Y</div>
            <YieldCompareChart :data-map="yieldsDataMap" />
          </div>
        </NGi>
        <!-- 10Y-2Y 利差（半宽，数据来自组件内 DailyIndicator yieldsDataMap） -->
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">10Y-2Y 利差</div>
            <div class="chart-box__sub">10Y-2Y 利差柱状图，正值蓝柱、负值红柱，含 0 倒挂线（虚线灰色）</div>
            <SpreadChart :data-map="yieldsDataMap" />
          </div>
        </NGi>
        <!-- 2Y + 10Y 收益率 vs 10Y-2Y 利差（跨双列，数据来自组件内 DailyIndicator yieldsDataMap） -->
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">2Y + 10Y 收益率 vs 10Y-2Y 利差</div>
            <div class="chart-box__sub">双轴综合视图：左轴 2Y/10Y 收益率折线，右轴 10Y-2Y 利差柱状（按正负着色）</div>
            <YieldComboChart :data-map="yieldsDataMap" />
          </div>
        </NGi>
        <!-- 10年期名义收益率 vs 10年期TIPS（跨双列，数据来自组件内 DailyIndicator yieldsDataMap） -->
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">10年期名义收益率 vs 10年期TIPS</div>
            <div class="chart-box__sub">双折线对比：名义蓝（#2563eb）、TIPS 橙（#ea580c）；两线差距 = 盈亏平衡通胀率，可观察市场对未来 10 年平均通胀预期</div>
            <YieldTipsChart :data-map="yieldsDataMap" />
          </div>
        </NGi>
      </NGrid>
    </NSpin>
  </div>
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
