<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'MetricCard' });

interface Props {
  /** 单个经济指标数据，为 null 时显示占位 */
  indicator: Api.Bds.EconomicIndicator | null;
  /** 加载状态 */
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// 前值对比：value > value_prev 显示红色↑，value < value_prev 显示绿色↓
const prevCompare = computed(() => {
  const { indicator } = props;
  if (!indicator || indicator.value_prev == null) return null;
  if (indicator.value > indicator.value_prev) return { text: '↑', color: '#dc2626' };
  if (indicator.value < indicator.value_prev) return { text: '↓', color: '#16a34a' };
  return { text: '→', color: '#6b7280' };
});

// 预期差标注：高于预期↑ / 低于预期↓
const expectedCompare = computed(() => {
  const { indicator } = props;
  if (!indicator || indicator.value_expected == null) return null;
  if (indicator.value > indicator.value_expected) return { text: '高于预期↑', color: '#dc2626' };
  if (indicator.value < indicator.value_expected) return { text: '低于预期↓', color: '#16a34a' };
  return null;
});

// 格式化数值：保留 2 位小数
const formattedValue = computed(() => {
  if (!props.indicator) return '--';
  return Number(props.indicator.value).toFixed(2);
});
</script>

<template>
  <div class="metric-card">
    <NSpin :show="loading">
      <div class="metric-card__label">{{ indicator?.indicator_name ?? '--' }}</div>
      <div class="metric-card__value">
        <span class="metric-card__num">{{ formattedValue }}</span>
        <span v-if="indicator?.unit" class="metric-card__unit">{{ indicator.unit }}</span>
        <span
          v-if="prevCompare"
          class="metric-card__arrow"
          :style="{ color: prevCompare.color }"
        >{{ prevCompare.text }}</span>
      </div>
      <div v-if="expectedCompare" class="metric-card__expected" :style="{ color: expectedCompare.color }">
        {{ expectedCompare.text }}
      </div>
      <div v-if="indicator?.report_date" class="metric-card__date">
        {{ indicator.report_date }}
      </div>
    </NSpin>
  </div>
</template>

<style scoped>
.metric-card {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 6px;
  padding: 1.25rem;
  text-align: center;
  height: 100%;
}

.metric-card__label {
  font-size: 0.82rem;
  color: var(--muted, #6b7280);
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-card__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
}

.metric-card__num {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent, #1e3a5f);
  line-height: 1.2;
}

.metric-card__unit {
  font-size: 0.85rem;
  color: var(--muted, #6b7280);
}

.metric-card__arrow {
  font-size: 1.1rem;
  font-weight: 700;
}

.metric-card__expected {
  font-size: 0.78rem;
  font-weight: 600;
  margin-top: 0.35rem;
}

.metric-card__date {
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
  margin-top: 0.3rem;
}
</style>
