<script setup lang="ts">
import GdpChart from './GdpChart.vue';
import BudgetChart from './BudgetChart.vue';
// 需求侧指标图表（原 consumption/ 目录，已归入 growth/）
import RetailDurableChart from './RetailDurableChart.vue';

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
</script>

<template>
  <NSpin :show="loading">
    <!-- 3 张图表同一行：大屏三等分（l:8），中屏两等分后第三张换行（m:12） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <!-- 零售销售 & 耐用品订单 & 成屋销售（合并图，三折线双轴） -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">零售销售 & 耐用品订单 & 成屋销售</div>
          <div class="chart-box__sub">左轴 %：；右轴 万户</div>
          <RetailDurableChart :data-map="dataMap" />
        </div>
      </NGi>
      <!-- GDP 季环比 -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">GDP 季环比</div>
          <div class="chart-box__sub">GDP 季环比增速（%），≥2 蓝柱高于潜在增速，0~2 琥珀温和增长，&lt;0 红柱负增长</div>
          <GdpChart :data-map="dataMap" />
        </div>
      </NGi>
      <!-- 政府预算 -->
      <NGi span="24 s:24 m:12 l:8">
        <div class="chart-box">
          <div class="chart-box__title">政府预算</div>
          <div class="chart-box__sub">政府预算（亿美元），正值蓝柱盈余，负值橙柱赤字</div>
          <BudgetChart :data-map="dataMap" />
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
  /* 固定副标题区域高度（2 行），避免因文字长度不同导致 chart-box 总高度不一致 */
  min-height: 32px;
}
</style>
