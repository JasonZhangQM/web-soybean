<script setup lang="ts">
import { computed } from 'vue';
import OvCard from './OvCard.vue';
import SignalCard from './SignalCard.vue';
import SfVsM2Chart from './SfVsM2Chart.vue';
import PmiChart from './PmiChart.vue';
import ScissorsChart from './ScissorsChart.vue';
import LprChart from './LprChart.vue';
import { getLatest } from '../utils';

defineOptions({ name: 'OverviewTab' });

/**
 * 中国宏观看板 - 总览 Tab
 * 三行布局：4 张核心指标大卡片 + 3 张传导信号卡 + 4 张图表（2×2）
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 第 1 行：4 张 OvCard 数据 =====

// 卡片 1：社融增量（流动性锚）
const sfLatest = computed(() => getLatest(props.dataMap, 'CN_SOCIAL_FINANCING_CUM'));
// 卡片 2：官方制造业 PMI
const pmiLatest = computed(() => getLatest(props.dataMap, 'CN_OFFICIAL_MFG_PMI'));
// 卡片 3：CPI 同比
const cpiLatest = computed(() => getLatest(props.dataMap, 'CN_CPI_YOY'));
// 卡片 4：工业企业利润同比
const profitLatest = computed(() => getLatest(props.dataMap, 'CN_INDUSTRIAL_PROFIT_YOY'));

// PMI 荣枯线判断：>=50 荣枯线上方，<50 荣枯线下方
const pmiDesc = computed(() => {
  const v = pmiLatest.value?.value;
  if (v == null) return '';
  return Number(v) >= 50 ? '荣枯线上方' : '荣枯线下方';
});

// CPI 区间判断：>=3 高位运行，0<=值<3 低位运行，<0 通缩压力
const cpiDesc = computed(() => {
  const v = cpiLatest.value?.value;
  if (v == null) return '';
  const n = Number(v);
  if (n >= 3) return '高位运行';
  if (n >= 0) return '低位运行';
  return '通缩压力';
});

// 格式化日期为 YYYY-MM
function fmtDate(d?: string | null) {
  if (!d) return '';
  return d.slice(0, 7);
}
</script>

<template>
  <div class="overview-tab">
    <NSpin :show="loading">
      <!-- 第 1 行：4 张核心指标大卡片 -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16" class="mb-16px">
        <NGi span="24 s:12 m:12 l:6">
          <OvCard
            label="社融增量"
            sub="流动性锚"
            :value="sfLatest?.value ?? null"
            unit="万亿元"
            color="#dc2626"
            :date="fmtDate(sfLatest?.report_date)"
            desc="报告日期"
          />
        </NGi>
        <NGi span="24 s:12 m:12 l:6">
          <OvCard
            label="官方制造业PMI"
            :value="pmiLatest?.value ?? null"
            color="#2563eb"
            :date="fmtDate(pmiLatest?.report_date)"
            :desc="pmiDesc"
          />
        </NGi>
        <NGi span="24 s:12 m:12 l:6">
          <OvCard
            label="CPI同比"
            :value="cpiLatest?.value ?? null"
            unit="%"
            color="#16a34a"
            :date="fmtDate(cpiLatest?.report_date)"
            :desc="cpiDesc"
          />
        </NGi>
        <NGi span="24 s:12 m:12 l:6">
          <OvCard
            label="工业企业利润同比"
            :value="profitLatest?.value ?? null"
            unit="%"
            color="#7c3aed"
            :date="fmtDate(profitLatest?.report_date)"
          />
        </NGi>
      </NGrid>

      <!-- 第 2 行：3 张传导信号卡 -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16" class="mb-16px">
        <NGi span="24 s:24 m:24 l:8">
          <SignalCard
            title="盈利驱动 → EPS"
            dot-color="#dc2626"
            :items="['GDP', '工业增加值', '工业利润', 'CPI/PPI 剪刀差', '社零', '房地产投资']"
            :percent="55"
            bar-color="#dc2626"
          />
        </NGi>
        <NGi span="24 s:24 m:24 l:8">
          <SignalCard
            title="流动性驱动 → PE"
            dot-color="#2563eb"
            :items="['社融增量', '新增贷款', 'M1/M2', 'LPR']"
            :percent="75"
            bar-color="#2563eb"
          />
        </NGi>
        <NGi span="24 s:24 m:24 l:8">
          <SignalCard
            title="预期+外部 → 风险偏好"
            dot-color="#0d9488"
            :items="['四大 PMI', '进出口', '外储', 'Swift 占比']"
            :percent="45"
            bar-color="#0d9488"
          />
        </NGi>
      </NGrid>

      <!-- 第 3 行：2×2 图表网格 -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="16" :y-gap="16">
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">社融增量 vs M2同比</div>
            <div class="chart-box__sub">流动性双锚：信用扩张 + 货币供应</div>
            <SfVsM2Chart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">PMI走势</div>
            <div class="chart-box__sub">官方制造业 vs 财新制造业（50荣枯线）</div>
            <PmiChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">CPI-PPI剪刀差</div>
            <div class="chart-box__sub">决定利润在产业链中的分配方向</div>
            <ScissorsChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">LPR 1Y vs 5Y</div>
            <div class="chart-box__sub">1Y影响企业贷款，5Y影响房贷/地产</div>
            <LprChart :data-map="dataMap" />
          </div>
        </NGi>
      </NGrid>
    </NSpin>
  </div>
</template>

<style scoped>
.overview-tab {
  width: 100%;
}

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
