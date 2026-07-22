<script setup lang="ts">
import { computed } from 'vue';
import FwMetricCard from '../FwMetricCard.vue';
import InfoCard from '../InfoCard.vue';
import UnemploymentChart from './UnemploymentChart.vue';
import { getLatest, getSeries } from '../../../economic-dashboard/modules/utils';

defineOptions({ name: 'LaborTab' });

/**
 * 维度三：劳动力市场 Tab
 * 展示城镇调查失业率指标卡片、走势图及待补充指标说明
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// 城镇调查失业率指标 code
const UNEMPLOYMENT_CODE = 'CN_URBAN_UNEMPLOYMENT';

// 最新一条记录（数组已按 report_date 升序，最后一项为最新）
const unemploymentLatest = computed(() => getLatest(props.dataMap, UNEMPLOYMENT_CODE));

// 时序数组，供图表渲染
const unemploymentData = computed(() => getSeries(props.dataMap, UNEMPLOYMENT_CODE));

// change = 当前值 - 上一期值（环比变化），数据不足或无效时返回 null
const unemploymentChange = computed<number | null>(() => {
  const list = unemploymentData.value;
  if (!list || list.length < 2) return null;
  const cur = Number(list[list.length - 1].value);
  const prev = Number(list[list.length - 2].value);
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  // 保留两位小数，避免浮点精度问题
  return +(cur - prev).toFixed(2);
});

// 劳动力市场待补充指标说明：顺序即展示顺序
const pendingItems = [
  { name: '城镇新增就业', desc: '反映企业用工意愿，比GDP更早转折' },
  { name: '平均工资增速', desc: '工资-价格螺旋是通胀的独立驱动力' },
  { name: '劳动参与率', desc: '结构性变量，受人口、教育、退休政策影响' },
  { name: '求人倍率', desc: '岗位空缺/求职人数，反映结构性错配' }
];
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：城镇调查失业率指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:8">
        <FwMetricCard
          label="城镇调查失业率"
          :value="unemploymentLatest?.value ?? null"
          unit="%"
          :change="unemploymentChange"
          timing="滞后"
          :date="unemploymentLatest?.report_date"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：失业率走势图 + 待补充指标说明（两列） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">城镇调查失业率走势</div>
          <div class="chart-box__sub">失业率反映劳动力市场闲置程度</div>
          <UnemploymentChart :data="unemploymentData" />
        </div>
      </NGi>
      <NGi span="24 m:12">
        <InfoCard title="劳动力市场待补充指标" badge="数据待补充" :items="pendingItems" />
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
