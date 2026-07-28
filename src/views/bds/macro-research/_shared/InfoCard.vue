<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'InfoCard' });

/**
 * 通用框架说明卡片
 * 展示标题、可选徽标/副标题与条目列表（名称 + 说明）
 * 样式与 economic-dashboard 的 chart-box 保持一致：白色背景、圆角边框
 */
interface InfoItem {
  /** 条目名称 */
  name: string;
  /** 条目说明 */
  desc: string;
}

interface Props {
  /** 卡片标题 */
  title: string;
  /** 条目列表 */
  items: InfoItem[];
  /** 徽标文本（如"数据待补充"），为空不显示 */
  badge?: string;
  /** 副标题，为空不显示 */
  subtitle?: string;
  /** 条目列表展示列数，默认 1 列；窄屏（<640px）始终回退为 1 列 */
  columns?: number;
}

const props = withDefaults(defineProps<Props>(), {
  badge: '',
  subtitle: '',
  columns: 1
});

// 是否有条目可展示
const hasItems = computed(() => Array.isArray(props.items) && props.items.length > 0);
</script>

<template>
  <NCard :bordered="false" class="info-card card-wrapper" size="small">
    <!-- 标题区：title + 可选 badge -->
    <div class="info-card__header">
      <span class="info-card__title">{{ title }}</span>
      <NTag v-if="badge" size="small" type="warning" round>{{ badge }}</NTag>
    </div>
    <!-- 副标题 -->
    <div v-if="subtitle" class="info-card__subtitle">{{ subtitle }}</div>
    <!-- 条目列表 -->
    <div
      v-if="hasItems"
      class="info-card__list"
      :style="{ '--info-card-cols': columns }"
    >
      <div v-for="(item, idx) in items" :key="idx" class="info-card__item">
        <span class="info-card__name">{{ item.name }}</span>
        <span class="info-card__desc">{{ item.desc }}</span>
      </div>
    </div>
    <!-- 空状态 -->
    <div v-else class="info-card__empty">暂无说明信息</div>
  </NCard>
</template>

<style scoped>
/* 标题区：名称 + 徽标横向排列 */
.info-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.info-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
}

/* 副标题：灰色小字 */
.info-card__subtitle {
  font-size: 11px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
}

/* 条目列表：通过 --info-card-cols 控制列数，默认 1 列；窄屏回退 1 列 */
.info-card__list {
  display: grid;
  grid-template-columns: repeat(var(--info-card-cols, 1), 1fr);
  column-gap: 16px;
}

@media (max-width: 640px) {
  .info-card__list {
    grid-template-columns: 1fr;
  }
}

.info-card__item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--rule, #f3f4f6);
}

.info-card__item:last-child {
  border-bottom: none;
}

/* 名称：加粗 */
.info-card__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
  flex-shrink: 0;
}

/* 说明：灰色小字 */
.info-card__desc {
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
  flex: 1 1 auto;
}

/* 空状态 */
.info-card__empty {
  padding: 16px 0;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted, #6b7280);
}
</style>
