<script setup lang="ts">
// 政策利率 vs 核心 PCE 图（原 policy/ 目录，已归入 financial/）
import RateVsPceChart from './RateVsPceChart.vue';
// 收益率综合图（原 yields/ 目录，已归入 financial/）
import YieldCompareChart from './YieldCompareChart.vue';

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
</script>

<template>
  <div class="pb-12px">
    <!-- 双数据源加载：政策利率用父组件 loading，收益率用父组件 yieldsLoading -->
    <NSpin :show="loading || yieldsLoading">
      <!-- 第 2 行：2 张图表，政策利率类用 dataMap，收益率类用 yieldsDataMap -->
      <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
        <!-- 利率 vs 核心 PCE（半宽，数据来自父注入 EconomicIndicator dataMap） -->
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">利率 vs 核心 PCE</div>
            <div class="chart-box__sub">左轴利率上下限（红/蓝）+ 右轴核心 PCE 同比（绿），观察政策利率与核心通胀的关系</div>
            <RateVsPceChart :data-map="dataMap" />
          </div>
        </NGi>
        <!-- 2Y / 10Y 收益率 + 10年期TIPS + 10Y-2Y 利差（半宽，合并自原 YieldCompareChart + SpreadChart + YieldTipsChart） -->
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">2Y / 10Y 收益率 + 10年期TIPS + 10Y-2Y 利差</div>
            <div class="chart-box__sub">左轴 2Y（蓝）/ 10Y（红）/ TIPS（橙）收益率实线 + 右轴 10Y-2Y 利差虚线（紫）带填充，含 0 倒挂线；10Y 与 TIPS 差距=盈亏平衡通胀率</div>
            <YieldCompareChart :data-map="yieldsDataMap" />
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
