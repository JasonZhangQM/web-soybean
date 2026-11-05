<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'SyncTaskPanel' });

/**
 * 同步任务进度面板（卡片 1/2/3 的统一呈现方式）
 *
 * 固定结构：状态标签 + 任务摘要 → 进度条 → 统计格 → 业务附加信息（默认插槽）→ 失败明细 / 完成提示。
 * 抽成共用组件而不是在各卡片里再抄一遍，保证四张同步卡片的状态与进度呈现完全一致。
 */
const props = withDefaults(
  defineProps<{
    task: Api.Bds.SyncTask | null;
    /** 任务是否在跑：控制失败明细的显示时机（跑完才展开） */
    running: boolean;
    /** 状态标签右侧的任务摘要，如「任务 #12 · 全市场」 */
    description?: string;
    /** 统计格；列数随条目数自适应，color 用于 success / error 着色 */
    stats?: Array<{ label: string; value: string | number; color?: string }>;
  }>(),
  { description: '', stats: () => [] }
);

/** 与各卡片原有的状态文案保持一致 */
const STATUS_MAP: Record<string, { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
  pending: { text: '等待中', type: 'default' },
  running: { text: '运行中', type: 'info' },
  done: { text: '已完成', type: 'success' },
  failed: { text: '失败', type: 'error' },
  stopped: { text: '已停止', type: 'warning' }
};

const statusLabel = computed(() => STATUS_MAP[props.task?.status || ''] || { text: '-', type: 'default' as const });
const progressValue = computed(() => Number(props.task?.progress || 0));
const errorList = computed(() => props.task?.errors || []);
const progressStatus = computed(() =>
  props.task?.status === 'failed' ? 'error' : props.task?.status === 'done' ? 'success' : 'default'
);

const errorColumns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '表', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];
</script>

<template>
  <div v-if="task" style="margin-top: 20px">
    <NSpace align="center">
      <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
      <span v-if="description" style="font-size: 13px; color: #666">{{ description }}</span>
    </NSpace>
    <NProgress
      type="line"
      :percentage="progressValue"
      :show-indicator="true"
      :indicator-width="38"
      :status="progressStatus"
      style="margin-top: 12px"
    />
    <NGrid v-if="stats.length" :cols="stats.length" :x-gap="12" style="margin-top: 8px">
      <NGridItem v-for="item in stats" :key="item.label">
        <NStatistic
          :label="item.label"
          :value="item.value"
          :value-style="item.color ? `color: ${item.color}` : undefined"
        />
      </NGridItem>
    </NGrid>

    <slot />

    <NCollapse v-if="!running && errorList.length > 0" style="margin-top: 12px">
      <NCollapseItem :title="`失败明细（${errorList.length}）`" name="errors">
        <NDataTable :columns="errorColumns" :data="errorList" :bordered="false" size="small" :max-height="240" />
      </NCollapseItem>
    </NCollapse>
    <div v-else-if="!running && task.status === 'done'" style="color: #18a058; font-size: 13px; margin-top: 12px">
      全部完成，无失败项
    </div>
  </div>
</template>
