<script setup lang="ts">
import { computed } from 'vue';
import MetricCard from '../../_shared/MetricCard.vue';

defineOptions({ name: 'FwMetricCard' });

/**
 * 框架指标卡片：基于经济看板 MetricCard 扩展
 * 在右上角叠加时序属性标签（先行/一致/滞后），其余能力完全复用 MetricCard
 */
interface Props {
  /** 上标签（指标中文名） */
  label: string;
  /** 主数值，为 null/undefined 时显示 -- */
  value: number | string | null | undefined;
  /** 单位（如 %、万亿元） */
  unit?: string;
  /** 同比/环比变化文本（如 '+1.2'） */
  change?: number | null;
  /** 变化类型：up=涨（红）/ down=跌（绿）/ flat=平（灰） */
  changeType?: 'up' | 'down' | 'flat';
  /** 副描述（如「扩张区间」「持续承压」） */
  desc?: string;
  /** 报告日期 */
  date?: string;
  /** 主数值颜色（覆盖默认） */
  color?: string;
  /** 时序属性：先行/一致/滞后，为空不显示标签 */
  timing?: '先行' | '一致' | '滞后' | '';
}

const props = withDefaults(defineProps<Props>(), { timing: '' });

// timing 对应的 NTag type：先行=info(蓝)、一致=success(绿)、滞后=warning(橙)
const tagType = computed<'info' | 'success' | 'warning' | 'default'>(() => {
  switch (props.timing) {
    case '先行':
      return 'info';
    case '一致':
      return 'success';
    case '滞后':
      return 'warning';
    default:
      return 'default';
  }
});
</script>

<template>
  <div class="fw-metric-card">
    <MetricCard
      :label="label"
      :value="value"
      :unit="unit"
      :change="change"
      :change-type="changeType"
      :desc="desc"
      :date="date"
      :color="color"
    />
    <!-- 时序属性徽标：timing 为空时不渲染 -->
    <NTag
      v-if="timing"
      class="fw-metric-card__tag"
      :type="tagType"
      size="small"
      round
    >
      {{ timing }}
    </NTag>
  </div>
</template>

<style scoped>
.fw-metric-card {
  position: relative;
  height: 100%;
}

/* 时序标签绝对定位到右上角 */
.fw-metric-card__tag {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
}
</style>
