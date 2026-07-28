<script setup lang="ts">
// PMI 全景对比图（原 manufacturing/ 目录，已归入 expectation/）
import AllPmiChart from './AllPmiChart.vue';
// 联储制造业指数图（原 regional/ 目录，已归入 expectation/）
import FedMfgIndexChart from './FedMfgIndexChart.vue';

defineOptions({ name: 'ExpectationTab' });

/** 预期 Tab：合并原制造业调查（4 PMI）+ 地区联储（2 联储指数），共 6 张图表 */
interface Props {
  /** 指标数据 Map（indicator_code -> 升序时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
  /** 加载状态 */
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false });
</script>

<template>
  <NSpin :show="loading">
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
