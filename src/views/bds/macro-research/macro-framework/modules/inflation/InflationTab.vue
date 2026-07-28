<script setup lang="ts">
import { computed } from 'vue';
import InfoCard from '../../../_shared/InfoCard.vue';
import InflationChart from './InflationChart.vue';
import UnemploymentChart from './UnemploymentChart.vue';
import { getSeries } from '../../../_shared/utils';

defineOptions({ name: 'InflationTab' });

/**
 * 维度二：通胀与就业
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

// ===== 城镇调查失业率 =====
const UNEMPLOYMENT_CODE = 'CN_URBAN_UNEMPLOYMENT';
const unemploymentData = computed(() => getSeries(props.dataMap, UNEMPLOYMENT_CODE));

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
  text-align: center;
  margin-bottom: 12px;
}
</style>
