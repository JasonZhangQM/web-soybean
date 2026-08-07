<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'DashboardMetricCard' });

/**
 * 通用小卡片：用于盈利/流动性/景气/外贸/消费 Tab 顶部的 metrics-row
 * 红涨绿跌（中国股市惯例）
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
  /** 变化类型：up=涨（红）/ down=跌（绿）/ flat=平（灰）；不传则按 change 正负自动推断 */
  changeType?: 'up' | 'down' | 'flat';
  /** 副描述（如「扩张区间」「持续承压」），可选 */
  desc?: string;
  /** 报告日期 */
  date?: string;
  /** 主数值颜色（覆盖默认），可选 */
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {});

// 格式化数值：保留 2 位小数，null/空显示 --
// 注意：Pydantic v2 会将 Decimal 序列化为 string，需对字符串也做转换
const formattedValue = computed(() => {
  if (props.value == null || props.value === '') return '--';
  const num = Number(props.value);
  return Number.isFinite(num) ? num.toFixed(2) : '--';
});

// 变化方向：优先使用 changeType，否则按 change 正负推断
const changeInfo = computed(() => {
  if (props.changeType) {
    return { type: props.changeType, color: props.changeType === 'up' ? '#dc2626' : props.changeType === 'down' ? '#16a34a' : '#6b7280' };
  }
  if (props.change == null) return null;
  if (props.change > 0) return { type: 'up' as const, color: '#dc2626' };
  if (props.change < 0) return { type: 'down' as const, color: '#16a34a' };
  return { type: 'flat' as const, color: '#6b7280' };
});

// 变化箭头与符号
const changeText = computed(() => {
  if (!changeInfo.value || props.change == null) return '';
  const sign = props.change > 0 ? '+' : '';
  return `${sign}${props.change.toFixed(2)}`;
});
</script>

<template>
  <div class="metric-card">
    <!-- 第一行：标题居中 -->
    <div class="metric-card__label">{{ label }}</div>
    <!-- 第二行：数据分两列（左：数值+单位+变化；右：desc+date） -->
    <div class="metric-card__body">
      <div class="metric-card__col metric-card__col--left">
        <div class="metric-card__value">
          <span class="metric-card__num" :style="color ? { color } : {}">{{ formattedValue }}</span>
          <span v-if="unit" class="metric-card__unit">{{ unit }}</span>
        </div>
        <div v-if="changeInfo && change" class="metric-card__change" :style="{ color: changeInfo.color }">
          {{ changeText }}
        </div>
      </div>
      <div class="metric-card__col metric-card__col--right">
        <div v-if="desc" class="metric-card__desc">{{ desc }}</div>
        <div v-if="date" class="metric-card__date">{{ date }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metric-card {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 6px;
  padding: 0.6rem 0.85rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.metric-card__label {
  font-size: 0.78rem;
  color: var(--muted, #6b7280);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-card__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.metric-card__col {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* 左列：数值/单位/变化，左对齐 */
.metric-card__col--left {
  align-items: flex-start;
}

/* 右列：desc/date，右对齐 */
.metric-card__col--right {
  align-items: flex-end;
  text-align: right;
}

.metric-card__value {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
}

.metric-card__num {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--accent, #1e3a5f);
  line-height: 1.1;
}

.metric-card__unit {
  font-size: 0.72rem;
  color: var(--muted, #6b7280);
}

.metric-card__change {
  font-size: 0.75rem;
  font-weight: 600;
}

.metric-card__desc {
  font-size: 0.7rem;
  color: var(--muted, #6b7280);
}

.metric-card__date {
  font-size: 0.68rem;
  color: var(--muted, #6b7280);
}
</style>
