<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'OvCard' });

/**
 * 总览 Tab 顶部大卡片
 * 居中展示单个核心指标的最新值，用于突出流动性/景气/通胀/盈利等锚点
 */
interface Props {
  /** 上标签（指标中文名，如「社融增量」） */
  label: string;
  /** 主数值，为 null/空时显示 -- */
  value: number | string | null;
  /** 单位（如 万亿元、%） */
  unit?: string;
  /** 上标签右侧副标签（如「流动性锚」），以 · 分隔显示 */
  sub?: string;
  /** 底部说明（如「荣枯线上方」） */
  desc?: string;
  /** 主数值颜色（如 #dc2626） */
  color: string;
  /** 报告日期（如 2025-06） */
  date?: string;
}

const props = withDefaults(defineProps<Props>(), {});

// 格式化数值：保留 2 位小数，null/空显示 --
// 注意：Pydantic v2 会将 Decimal 序列化为 string，需对字符串也做转换
const formattedValue = computed(() => {
  if (props.value == null || props.value === '') return '--';
  const num = Number(props.value);
  return Number.isFinite(num) ? num.toFixed(2) : '--';
});
</script>

<template>
  <div class="ov-card">
    <div class="ov-card__label">
      <span>{{ label }}</span>
      <span v-if="sub" class="ov-card__sub"> · {{ sub }}</span>
    </div>
    <div class="ov-card__value">
      <span class="ov-card__num" :style="{ color }">{{ formattedValue }}</span>
      <span v-if="unit" class="ov-card__unit">{{ unit }}</span>
    </div>
    <div class="ov-card__bottom">
      <span v-if="date" class="ov-card__date">{{ date }}</span>
      <span v-if="date && desc" class="ov-card__sep"> · </span>
      <span v-if="desc" class="ov-card__desc">{{ desc }}</span>
    </div>
  </div>
</template>

<style scoped>
.ov-card {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 8px;
  padding: 16px 20px;
  text-align: center;
  height: 130px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.ov-card__label {
  font-size: 12px;
  color: var(--muted, #6b7280);
  font-weight: 500;
  letter-spacing: 0.5px;
}

.ov-card__sub {
  font-size: 12px;
  color: var(--muted, #6b7280);
}

.ov-card__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}

.ov-card__num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.ov-card__unit {
  font-size: 14px;
  color: var(--muted, #6b7280);
  font-weight: 500;
}

.ov-card__bottom {
  font-size: 12px;
  color: var(--muted, #6b7280);
  line-height: 1.4;
}

.ov-card__sep {
  color: var(--muted, #6b7280);
}
</style>
