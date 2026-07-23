<script setup lang="ts">
import InfoCard from '../InfoCard.vue';

defineOptions({ name: 'StructuralPanel' });

/**
 * 结构性底座面板
 * 展示影响经济长期趋势的五个慢变量（人口、技术、城镇化、产业结构、能源转型）
 * 这些变量决定所有周期波动的基准线，对应"趋势本身在哪里"这一问题
 */
interface InfoItem {
  name: string;
  desc: string;
}

// 五个结构性因素的静态说明：顺序即展示顺序
const items: InfoItem[] = [
  {
    name: '人口结构',
    desc: '劳动年龄人口占比、抚养比、中位年龄。决定潜在增长率、储蓄率、自然利率。中国劳动年龄人口2012年见顶，老龄化加速'
  },
  {
    name: '技术进步',
    desc: 'TFP增速、专利数量、数字化渗透率。决定长期生产率增长路径。AI浪潮可能提升TFP，但传导尚需时间'
  },
  {
    name: '城镇化',
    desc: '城镇化率、户籍改革进度。劳动力重新配置的红利。中国城镇化率约66%，增速放缓'
  },
  {
    name: '产业结构',
    desc: '服务业占比、制造业升级指数。影响通胀结构（服务业通胀更粘性）。服务业占比持续上升'
  },
  {
    name: '能源转型',
    desc: "绿色投资占比、碳排放强度。影响中长期通胀中枢和资本开支方向。'绿色通胀'推升能源转型成本"
  }
];
</script>

<template>
  <InfoCard
    title="结构性底座"
    badge="慢变量 · 十年尺度"
    subtitle="决定所有周期波动的基准线——'趋势本身在哪里'"
    :items="items"
    :columns="2"
  />
</template>
