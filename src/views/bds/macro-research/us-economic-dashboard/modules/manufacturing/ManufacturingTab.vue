<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板的 MetricCard 组件
// 注：manufacturing/ 目录下需向上 3 级到达 macro-research/，再进入 economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
import MfgPmiCompareChart from './MfgPmiCompareChart.vue';
import SvcPmiCompareChart from './SvcPmiCompareChart.vue';
import AllPmiChart from './AllPmiChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'ManufacturingTab' });

/** 制造业调查 Tab：4 张 PMI 指标卡片 + 3 张对比图 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各 PMI 指标最新值（数组已按 report_date 升序，最后一项为最新）=====
const ismMfgLatest = computed(() => getLatest(props.dataMap, 'ISM_MFG_PMI'));
const spMfgLatest = computed(() => getLatest(props.dataMap, 'SP_GLOBAL_MFG_PMI'));
const ismNonMfgLatest = computed(() => getLatest(props.dataMap, 'ISM_NON_MFG_PMI'));
const spSvcLatest = computed(() => getLatest(props.dataMap, 'SP_GLOBAL_SVC_PMI'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

/**
 * PMI 区间判定：>=50 扩张（up 红），<50 收缩（down 绿）
 * changeType 按 value 阈值判定（非 MoM 方向），与 desc 配合表达「扩张/收缩」状态
 * 无值时返回空描述与 undefined changeType
 */
function pmiZone(value: number | string | null | undefined): {
  desc: string;
  changeType: 'up' | 'down' | undefined;
} {
  if (value == null || value === '') return { desc: '', changeType: undefined };
  const num = Number(value);
  if (!Number.isFinite(num)) return { desc: '', changeType: undefined };
  return num >= 50 ? { desc: '扩张', changeType: 'up' } : { desc: '收缩', changeType: 'down' };
}

const ismMfgZone = computed(() => pmiZone(ismMfgLatest.value?.value));
const spMfgZone = computed(() => pmiZone(spMfgLatest.value?.value));
const ismNonMfgZone = computed(() => pmiZone(ismNonMfgLatest.value?.value));
const spSvcZone = computed(() => pmiZone(spSvcLatest.value?.value));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张 PMI 指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="ISM制造业PMI"
          :value="ismMfgLatest?.value ?? null"
          :date="ismMfgLatest?.report_date"
          :change="computeChange(ismMfgLatest)"
          :change-type="ismMfgZone.changeType"
          :desc="ismMfgZone.desc"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="标普全球制造业PMI"
          :value="spMfgLatest?.value ?? null"
          :date="spMfgLatest?.report_date"
          :change="computeChange(spMfgLatest)"
          :change-type="spMfgZone.changeType"
          :desc="spMfgZone.desc"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="ISM非制造业PMI"
          :value="ismNonMfgLatest?.value ?? null"
          :date="ismNonMfgLatest?.report_date"
          :change="computeChange(ismNonMfgLatest)"
          :change-type="ismNonMfgZone.changeType"
          :desc="ismNonMfgZone.desc"
        />
      </NGi>
      <NGi span="24 s:12 m:8 l:4">
        <MetricCard
          label="标普全球服务业PMI"
          :value="spSvcLatest?.value ?? null"
          :date="spSvcLatest?.report_date"
          :change="computeChange(spSvcLatest)"
          :change-type="spSvcZone.changeType"
          :desc="spSvcZone.desc"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：3 张图表（2 列布局，最后一张跨双列） -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">ISM 制造业 vs 标普全球制造业 PMI</div>
          <div class="chart-box__sub">美国本土 ISM 与标普全球（原 IHS Markit）制造业 PMI 对比，PMI &gt; 50 扩张，&lt; 50 收缩</div>
          <MfgPmiCompareChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">ISM 非制造业 vs 标普全球服务业 PMI</div>
          <div class="chart-box__sub">美国服务业景气度对比，ISM 非制造业涵盖服务业及建筑业，标普全球服务业 PMI 聚焦服务业</div>
          <SvcPmiCompareChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">四大 PMI 全景对比</div>
          <div class="chart-box__sub">ISM 制造业 / ISM 非制造业 / 标普全球制造业 / 标普全球服务业 PMI 综合对比，50 荣枯线为分界</div>
          <AllPmiChart :data-map="dataMap" />
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
