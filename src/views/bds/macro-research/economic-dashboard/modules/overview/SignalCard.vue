<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'SignalCard' });

/**
 * 信号卡：展示某条宏观传导路径的覆盖指标与权重进度条
 * 用于总览 Tab 第二行（盈利/流动性/预期+外部 三大传导信号）
 */
interface Props {
  /** 标题（如「盈利驱动 → EPS」） */
  title: string;
  /** 标题前彩色圆点颜色 */
  dotColor: string;
  /** 内容项数组（用 · 连接显示） */
  items: string[];
  /** 进度百分比（0-100） */
  percent: number;
  /** 进度条填充颜色 */
  barColor: string;
}

const props = withDefaults(defineProps<Props>(), {});

// 进度百分比安全限制在 0-100 范围内
const safePercent = computed(() => {
  const p = Number(props.percent) || 0;
  return Math.max(0, Math.min(100, p));
});

// 用 · 拼接所有 items
const itemsText = computed(() => (props.items || []).join(' · '));
</script>

<template>
  <div class="signal-card">
    <div class="signal-card__title">
      <span class="signal-card__dot" :style="{ background: dotColor }"></span>
      <span>{{ title }}</span>
    </div>
    <div class="signal-card__items">{{ itemsText }}</div>
    <div class="signal-card__bar">
      <div class="signal-card__fill" :style="{ width: `${safePercent}%`, background: barColor }"></div>
    </div>
  </div>
</template>

<style scoped>
.signal-card {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

.signal-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
}

.signal-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.signal-card__items {
  font-size: 12px;
  color: var(--muted, #6b7280);
  line-height: 1.8;
}

.signal-card__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--rule, #e5e7eb);
  margin-top: auto;
  overflow: hidden;
}

.signal-card__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>
