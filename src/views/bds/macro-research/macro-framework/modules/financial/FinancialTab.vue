<script setup lang="ts">
import InfoCard from '../InfoCard.vue';

defineOptions({ name: 'FinancialTab' });

/**
 * 维度四：金融条件 Tab
 * 无数据展示，仅以 InfoCard 呈现金融条件核心指标说明及关键案例
 * BIS 研究表明信贷创造和资产价格的共振具有独立的周期性，需独立维度捕捉
 */
interface Props {
  loading?: boolean;
}
withDefaults(defineProps<Props>(), { loading: false });

// 金融条件核心指标说明：顺序即展示顺序
const items = [
  { name: '信用利差（IG/HY Spread）', desc: '市场风险定价，反映信用违约预期，领先于实体经济' },
  { name: '信贷脉冲（Credit Impulse）', desc: '新增信贷占GDP比重的变化率，领先GDP约2个季度' },
  { name: '金融条件指数（FCI）', desc: '综合利率、汇率、信用利差、资产价格，芝加哥联储/OECD编制' },
  { name: '宏观杠杆率', desc: '各部门债务/GDP，决定经济的"脆弱性"，是危机的先行指标' },
  { name: '资产价格偏离度', desc: '房价/股价对基本面的偏离，BIS金融周期核心预警指标' }
];

// 关键案例：供给侧改革期间金融条件独立转折的实证
const caseText =
  '关键案例：2015-2017年中国供给侧改革期间，GDP增速稳定在6.7-6.9%，CPI温和在1.5-2.0%，四维框架显示"经济平稳"。但信贷脉冲从+5%骤降至-2%，金融条件急剧收紧——这一关键转折只有通过独立的金融条件维度才能捕捉。';
</script>

<template>
  <NSpin :show="loading">
    <!-- 金融条件核心指标说明卡片 -->
    <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12">
      <NGi span="24">
        <InfoCard
          title="金融条件与信用周期"
          badge="数据待补充"
          subtitle="BIS 研究表明信贷创造和资产价格的共振具有独立的周期性，周期长度15-20年"
          :items="items"
        />
      </NGi>
    </NGrid>

    <!-- 关键案例说明 -->
    <NCard :bordered="false" class="mt-12px financial-case" size="small">
      {{ caseText }}
    </NCard>
  </NSpin>
</template>

<style scoped>
.financial-case {
  font-size: 0.8rem;
  color: var(--muted, #6b7280);
  line-height: 1.7;
}
</style>
