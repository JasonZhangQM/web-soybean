<script setup lang="ts">
/**
 * 标的监测抽屉通用「标题栏」（2026-11-10）：把每个小节的标题放进一条带底色的横条，
 * 从「档位」Tab 推广到概览 / 估值与走势 / 研究与逻辑 / 剧本与成交等所有 Tab，
 * 取代原先的分隔线，页面更紧凑。
 *
 * 所有栏样式完全一致（同一中性底色 + 左色条），文字颜色继承父级 ⇒ 明暗主题都可读。
 * - 默认插槽：口径说明 / 状态标签 / 时点切换，**紧跟标题靠左**；
 * - actions 插槽：刷新、新增等操作按钮，**靠右**。
 */
import { useSlots } from 'vue';

defineOptions({ name: 'UnderlyingSectionBar' });

defineProps<{ title: string }>();

const slots = useSlots();
</script>

<template>
  <div class="section-bar">
    <span class="section-bar-title">{{ title }}</span>
    <div class="section-bar-note">
      <slot />
    </div>
    <div v-if="slots.actions" class="section-bar-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.section-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0 8px;
  padding: 4px 10px;
  border-radius: 4px;
  border-left: 3px solid rgba(128, 128, 128, 0.5);
  background: rgba(128, 128, 128, 0.1);
}

.section-bar-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.section-bar-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.section-bar-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* 栏内单选切换：Naive UI 默认 medium=34px、small=28px，组容器 / 按钮 / 分隔线
   三处都由 --n-height 撑高，且组容器是 inline-block + line-height=28px ⇒ 只压 height
   会让文字仍按 28px 行盒对齐、视觉偏上。这里三者统一压到 22px，并改成 inline-flex
   + align-items:center，让组、按钮文字、分隔线在标题栏里真正上下居中。 */
.section-bar :deep(.n-radio-group) {
  display: inline-flex;
  align-items: center;
  height: 22px;
  line-height: 1;
  vertical-align: middle;
}

.section-bar :deep(.n-radio-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  line-height: 1;
  font-size: 12px;
}

.section-bar :deep(.n-radio-group__splitor) {
  height: 22px;
}
</style>
