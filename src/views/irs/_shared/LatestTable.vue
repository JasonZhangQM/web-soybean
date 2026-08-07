<script setup lang="ts">
/**
 * 图表左上方半透明（50%）数据表格
 * 用于在折线/柱状图左上方叠加展示各指标最新值
 * - 绝对定位至父容器（父容器需 position: relative）
 * - 半透明背景，不遮挡图表内容
 * - pointer-events: none，不影响 tooltip 交互
 *
 * 使用方式：
 *   <div class="relative">
 *     <div ref="domRef" class="h-260px w-full"></div>
 *     <LatestTable :rows="latestRows" :left="56" />
 *   </div>
 */
interface LatestRow {
  /** 指标名称 */
  name: string;
  /** 与折线/柱状颜色一致的颜色点 */
  color: string;
  /** 已格式化的最新值（如 "52.30"） */
  value: string;
  /** 已格式化的日期（如 "2026-07-01"） */
  date: string;
}

withDefaults(defineProps<{
  rows: LatestRow[];
  /** 左偏移量（px），应 = echarts grid.left + 少量间距，避免遮挡 y 轴刻度数值 */
  left?: number;
}>(), { left: 56 });
</script>

<template>
  <table class="latest-table" :style="{ left: left + 'px' }">
    <thead>
      <tr>
        <th>指标</th>
        <th>最新值</th>
        <th>日期</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.name">
        <td>
          <span class="dot" :style="{ background: row.color }"></span>
          {{ row.name }}
        </td>
        <td>{{ row.value }}</td>
        <td>{{ row.date }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* 半透明（50%）浮动表格，绝对定位至图表左上方 */
/* top 对齐 echarts grid.top（30px），使表格上沿与图表最上方刻度对齐 */
.latest-table {
  position: absolute;
  top: 30px;
  z-index: 9;
  border-collapse: collapse;
  font-size: 11px;
  color: var(--ink, #1a1a2e);
  background: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  user-select: none;
}

.latest-table th,
.latest-table td {
  padding: 2px 6px;
  border: 1px solid rgba(209, 213, 219, 0.6);
  white-space: nowrap;
  text-align: center;
}

.latest-table th {
  font-weight: 600;
  background: rgba(229, 231, 235, 0.5);
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

:global(html.dark) .latest-table {
  color: #e0e0e0;
  background: rgba(31, 41, 55, 0.5);
}

:global(html.dark) .latest-table th {
  background: rgba(55, 65, 81, 0.5);
}
</style>
