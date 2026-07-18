<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 energy/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import CrudeChart from './CrudeChart.vue';
import GasolineChart from './GasolineChart.vue';
import EnergyComboChart from './EnergyComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'EnergyTab' });

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
const crudeLatest = computed(() => getLatest(props.dataMap, 'EIA_CRUDE_OIL_INVENTORY_CHANGE'));
const gasolineLatest = computed(() => getLatest(props.dataMap, 'EIA_GASOLINE_INVENTORY_CHANGE'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：2 张指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="EIA原油库存变动"
          :value="crudeLatest?.value ?? null"
          unit="万桶"
          :date="crudeLatest?.report_date"
          :change="computeChange(crudeLatest)"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="EIA汽油库存变动"
          :value="gasolineLatest?.value ?? null"
          unit="万桶"
          :date="gasolineLatest?.report_date"
          :change="computeChange(gasolineLatest)"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：3 张图表（2 列布局，最后一张跨双列） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">EIA 原油库存变动</div>
          <div class="chart-box__sub">EIA 周度商业原油库存变化（万桶），正值蓝柱表示库存增加，负值橙柱表示库存减少</div>
          <CrudeChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">EIA 汽油库存变动</div>
          <div class="chart-box__sub">EIA 周度汽油库存变化（万桶），正值青柱表示库存增加，负值红柱表示库存减少</div>
          <GasolineChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">原油 vs 汽油库存对比</div>
          <div class="chart-box__sub">原油与汽油库存变动双柱对比，以原油日期为主轴对齐汽油，观察上下游库存同步性</div>
          <EnergyComboChart :data-map="dataMap" />
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
