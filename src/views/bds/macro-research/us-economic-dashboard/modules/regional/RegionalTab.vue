<script setup lang="ts">
import { computed } from 'vue';
// 跨目录复用中国看板 MetricCard：从 regional/ 经 modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import NyFedChart from './NyFedChart.vue';
import RichmondFedChart from './RichmondFedChart.vue';
import RegionalComboChart from './RegionalComboChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'RegionalTab' });

interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各指标最新值（数组已按 report_date 升序，最后一项为最新） =====
const nyFedLatest = computed(() => getLatest(props.dataMap, 'NY_FED_MFG_INDEX'));
const richmondFedLatest = computed(() => getLatest(props.dataMap, 'RICHMOND_FED_MFG_INDEX'));

// 环比变化：value - value_prev（value_prev 为 null 时返回 null，MetricCard 自动隐藏）
function computeChange(item: Api.Bds.EconomicIndicator | null): number | null {
  if (!item || item.value_prev == null) return null;
  return Number(item.value) - Number(item.value_prev);
}

/**
 * 联储制造业指数区间判定：>=0 扩张（up 红），<0 收缩（down 绿）
 * 与 PMI 50 荣枯线场景类似，但此处阈值为 0
 * changeType 按 value 阈值判定（非 MoM 方向），与 desc 配合表达「扩张/收缩」状态
 */
function zone(value: number | string | null | undefined): {
  desc: string;
  changeType: 'up' | 'down' | undefined;
} {
  if (value == null || value === '') return { desc: '', changeType: undefined };
  const num = Number(value);
  if (!Number.isFinite(num)) return { desc: '', changeType: undefined };
  return num >= 0 ? { desc: '扩张', changeType: 'up' } : { desc: '收缩', changeType: 'down' };
}

const nyFedZone = computed(() => zone(nyFedLatest.value?.value));
const richmondFedZone = computed(() => zone(richmondFedLatest.value?.value));
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：2 张指标卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:8 l:6">
        <MetricCard
          label="纽约联储制造业指数"
          :value="nyFedLatest?.value ?? null"
          :date="nyFedLatest?.report_date"
          :change="computeChange(nyFedLatest)"
          :change-type="nyFedZone.changeType"
          :desc="nyFedZone.desc"
        />
      </NGi>
      <NGi span="12 s:12 m:8 l:6">
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

    <!-- 第 2 行：2 张单指标图表（2 列布局） -->
    <!-- 第 3 行：综合对比图跨双列 -->
    <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">纽约联储制造业指数</div>
          <div class="chart-box__sub">纽约联储月度制造业景气调查，0 为荣枯分界线，&gt;=0 扩张，&lt;0 收缩</div>
          <NyFedChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24 s:24 m:12">
        <div class="chart-box">
          <div class="chart-box__title">里士满联储制造业指数</div>
          <div class="chart-box__sub">里士满联储月度制造业景气调查，0 为荣枯分界线，&gt;=0 扩张，&lt;0 收缩</div>
          <RichmondFedChart :data-map="dataMap" />
        </div>
      </NGi>
      <NGi span="24">
        <div class="chart-box">
          <div class="chart-box__title">地区联储 vs ISM 制造业综合对比</div>
          <div class="chart-box__sub">三指标 min-max 标准化至 0-100 后对比，以 ISM 制造业 PMI 日期为主轴对齐其他指标，50 中线为参考</div>
          <RegionalComboChart :data-map="dataMap" />
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
