<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 expectation/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../_shared/MetricCard.vue';
// 跨目录复用原 manufacturing/ 目录下的 PMI 对比图表（合并 Tab 后保留图表，避免重复实现）
import AllPmiChart from '../manufacturing/AllPmiChart.vue';
// 跨目录复用原 regional/ 目录下的联储指数图表
import FedMfgIndexChart from '../regional/FedMfgIndexChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'ExpectationTab' });

/** 预期 Tab：合并原制造业调查（4 PMI）+ 地区联储（2 联储指数），共 6 张卡片 + 6 张图表 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值（数组已按 report_date 升序，最后一项为最新）=====
// 原 制造业调查 Tab（4 PMI）
const ismMfgLatest = computed(() => getLatest(props.dataMap, 'ISM_MFG_PMI'));
const spMfgLatest = computed(() => getLatest(props.dataMap, 'SP_GLOBAL_MFG_PMI'));
const ismNonMfgLatest = computed(() => getLatest(props.dataMap, 'ISM_NON_MFG_PMI'));
const spSvcLatest = computed(() => getLatest(props.dataMap, 'SP_GLOBAL_SVC_PMI'));
// 原 地区联储 Tab（2 联储指数）
const nyFedLatest = computed(() => getLatest(props.dataMap, 'NY_FED_MFG_INDEX'));
const richmondFedLatest = computed(() => getLatest(props.dataMap, 'RICHMOND_FED_MFG_INDEX'));

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

/**
 * 联储制造业指数区间判定：>=0 扩张（up 红），<0 收缩（down 绿）
 * 与 PMI 50 荣枯线场景类似，但此处阈值为 0
 * 命名为 fedZone 以与 pmiZone 区分
 */
function fedZone(value: number | string | null | undefined): {
  desc: string;
  changeType: 'up' | 'down' | undefined;
} {
  if (value == null || value === '') return { desc: '', changeType: undefined };
  const num = Number(value);
  if (!Number.isFinite(num)) return { desc: '', changeType: undefined };
  return num >= 0 ? { desc: '扩张', changeType: 'up' } : { desc: '收缩', changeType: 'down' };
}

// PMI 卡片区间（阈值 50）
const ismMfgZone = computed(() => pmiZone(ismMfgLatest.value?.value));
const spMfgZone = computed(() => pmiZone(spMfgLatest.value?.value));
const ismNonMfgZone = computed(() => pmiZone(ismNonMfgLatest.value?.value));
const spSvcZone = computed(() => pmiZone(spSvcLatest.value?.value));
// 联储卡片区间（阈值 0）
const nyFedZone = computed(() => fedZone(nyFedLatest.value?.value));
const richmondFedZone = computed(() => fedZone(richmondFedLatest.value?.value));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：6 张指标卡片（大屏单行排列，l 断点 6*4=24） -->
    <!-- 前 4 张为 PMI（阈值 50），后 2 张为联储指数（阈值 0） -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="ISM制造业PMI"
          :value="ismMfgLatest?.value ?? null"
          :date="ismMfgLatest?.report_date"
          :change="computeChange(ismMfgLatest)"
          :change-type="ismMfgZone.changeType"
          :desc="ismMfgZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="标普全球制造业PMI"
          :value="spMfgLatest?.value ?? null"
          :date="spMfgLatest?.report_date"
          :change="computeChange(spMfgLatest)"
          :change-type="spMfgZone.changeType"
          :desc="spMfgZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="ISM非制造业PMI"
          :value="ismNonMfgLatest?.value ?? null"
          :date="ismNonMfgLatest?.report_date"
          :change="computeChange(ismNonMfgLatest)"
          :change-type="ismNonMfgZone.changeType"
          :desc="ismNonMfgZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="标普全球服务业PMI"
          :value="spSvcLatest?.value ?? null"
          :date="spSvcLatest?.report_date"
          :change="computeChange(spSvcLatest)"
          :change-type="spSvcZone.changeType"
          :desc="spSvcZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="纽约联储制造业指数"
          :value="nyFedLatest?.value ?? null"
          :date="nyFedLatest?.report_date"
          :change="computeChange(nyFedLatest)"
          :change-type="nyFedZone.changeType"
          :desc="nyFedZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:4">
        <MetricCard
          label="里士满联储制造业指数"
          :value="richmondFedLatest?.value ?? null"
          :date="richmondFedLatest?.report_date"
          :change="computeChange(richmondFedLatest)"
          :change-type="richmondFedZone.changeType"
          :desc="richmondFedZone.desc"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行起：2 张图表，半宽置于同一行 -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <!-- 四大 PMI 全景对比（综合图，半宽） -->
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">四大 PMI 全景对比</div>
          <div class="chart-box__sub">ISM 制造业 / ISM 非制造业 / 标普全球制造业 / 标普全球服务业 PMI 综合对比，50 荣枯线为分界</div>
          <AllPmiChart :data-map="dataMap" />
        </div>
      </NGi>
      <!-- 纽约联储 & 里士满联储制造业指数（合并图，双折线 + 0 荣枯线，半宽） -->
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">纽约联储 & 里士满联储制造业指数</div>
          <div class="chart-box__sub">双折线对比：纽约联储青（#0891b2）、里士满联储紫（#7c3aed），0 为荣枯分界线，&gt;=0 扩张，&lt;0 收缩</div>
          <FedMfgIndexChart :data-map="dataMap" />
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
