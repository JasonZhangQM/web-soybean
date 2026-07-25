<script setup lang="ts">
import { computed } from 'vue';
import InfoCard from '../InfoCard.vue';
import FwMetricCard from '../FwMetricCard.vue';
import PmiChart from '../../../_shared/PmiChart.vue';
import { getLatest } from '../../../_shared/utils';

defineOptions({ name: 'ExpectationPanel' });

/**
 * 预期与信心面板
 * 顶部展示 4 张 PMI 指标数据卡片 + 中国四大 PMI 走势图（官方实线、财新虚线）
 * 下方附加贯穿所有维度的"自我实现层"指标说明（消费者信心、企业家信心、通胀预期、市场波动率）
 * 预期可以改变所有维度的传导效率，属快变量，实时-月度尺度
 */
interface Props {
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });

// ===== 各 PMI 指标最新值（数组按 report_date 升序，最后一项为最新）=====
const officialMfgLatest = computed(() => getLatest(props.dataMap, 'CN_OFFICIAL_MFG_PMI'));
const officialNonMfgLatest = computed(() => getLatest(props.dataMap, 'CN_OFFICIAL_NON_MFG_PMI'));
const caixinMfgLatest = computed(() => getLatest(props.dataMap, 'CN_RATINGDOG_MFG_PMI'));
const caixinSvcLatest = computed(() => getLatest(props.dataMap, 'CN_RATINGDOG_SVC_PMI'));

interface InfoItem {
  name: string;
  desc: string;
}

// 四个预期指标的静态说明：顺序即展示顺序
const items: InfoItem[] = [
  {
    name: '消费者信心指数',
    desc: '密歇根大学/Conference Board编制，领先消费支出1-2个季度'
  },
  {
    name: 'PMI预期分项/企业家信心',
    desc: 'ISM/国家统计局，领先投资和库存周期'
  },
  {
    name: '通胀预期（盈亏平衡利率）',
    desc: 'TIPS利差/调查数据，决定实际利率和央行决策'
  },
  {
    name: '市场波动率（VIX/中国波指）',
    desc: 'CBOE/上交所，风险情绪的实时指标'
  }
];
</script>

<template>
  <NSpin :show="loading">
    <!-- 第 1 行：4 张 PMI 指标数据卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="官方制造业PMI"
          :value="officialMfgLatest?.value ?? null"
          unit=""
          desc="50 为荣枯分水岭"
          :date="officialMfgLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="官方非制造业PMI"
          :value="officialNonMfgLatest?.value ?? null"
          unit=""
          desc="50 为荣枯分水岭"
          :date="officialNonMfgLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="财新制造业PMI"
          :value="caixinMfgLatest?.value ?? null"
          unit=""
          desc="50 为荣枯分水岭"
          :date="caixinMfgLatest?.report_date"
          timing="一致"
        />
      </NGi>
      <NGi span="12 s:12 m:6 l:6">
        <FwMetricCard
          label="财新服务业PMI"
          :value="caixinSvcLatest?.value ?? null"
          unit=""
          desc="50 为荣枯分水岭"
          :date="caixinSvcLatest?.report_date"
          timing="一致"
        />
      </NGi>
    </NGrid>

    <!-- 第 2 行：中国四大 PMI 走势图 -->
    <div class="chart-box">
      <div class="chart-box__title">中国 PMI 走势</div>
      <PmiChart :data-map="dataMap" />
    </div>

    <!-- 第 3 行：预期与信心说明卡片 -->
    <InfoCard
      class="mt-16px"
      title="预期与信心"
      badge="快变量 · 实时-月度尺度"
      subtitle="贯穿所有维度的'自我实现层'——预期可以改变所有维度的传导效率"
      :items="items"
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
  margin-bottom: 4px;
}
</style>
