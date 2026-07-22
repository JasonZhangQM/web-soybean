<script setup lang="ts">
import InfoCard from '../InfoCard.vue';

defineOptions({ name: 'ExpectationPanel' });

/**
 * 预期与信心面板
 * 展示贯穿所有维度的"自我实现层"指标（消费者信心、企业家信心、通胀预期、市场波动率）
 * 预期可以改变所有维度的传导效率，属快变量，实时-月度尺度
 */
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
  <InfoCard
    title="预期与信心"
    badge="快变量 · 实时-月度尺度"
    subtitle="贯穿所有维度的'自我实现层'——预期可以改变所有维度的传导效率"
    :items="items"
  />
</template>
