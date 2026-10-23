<script setup lang="ts">
/**
 * 抽屉内统一数据表 —— 与列表页 `/irs/value-monitors` 用同一套 `NDataTable` + 内置分页器。
 *
 * 为什么换掉原来的裸 NDataTable + 自建 `MiniPager`：
 * 抽屉和列表页是同一套信息架构，行高、表头、分页条（「共 N 条」+ 页码 + 每页条数）
 * 出现两套样式，会让人以为这是两个系统。现在统一由 NDataTable 的 `pagination` 承担。
 *
 * 与列表页的唯一差别：抽屉的数据在本地（`detail` 一次给全），不发请求，
 * 所以不传 `remote` —— NDataTable 自己按 page/pageSize 切数据、自己算 itemCount。
 * 本组件只维护「当前第几页」这一个状态。
 *
 * 📌 `pageSize` 是各表的展示语义，不是用户偏好：计划 5 条、成交 8 条、档位 10 条，
 *    目的是「一屏内看完 + 不挤压上方内容」。所以传进来的默认值优先，
 *    但用户仍可通过分页器的「N 条/页」临时调整（与列表页同一个控件）。
 */
import { computed, ref } from 'vue';
import type { DataTableColumns, PaginationProps } from 'naive-ui';

defineOptions({ name: 'VmDataTable' });

const props = withDefaults(
  defineProps<{
    columns: DataTableColumns<any>;
    data: any[];
    /** 每页条数；传 0 表示不分页（整段显示） */
    pageSize?: number;
  }>(),
  { pageSize: 0 }
);

/** 分页器可选的每页条数，与列表页 `createTablePagination` 的 pageSizes 对齐 */
const SIZE_PRESETS = [10, 20, 50, 100];

const page = ref(1);
/** 用户手动改过每页条数后以它为准（覆盖 props.pageSize） */
const sizeOverride = ref<number | null>(null);

/** 实际生效的页大小（props 默认值 + 用户在分页器里的临时选择） */
const effPageSize = computed(() => sizeOverride.value ?? props.pageSize);
const itemCount = computed(() => props.data.length);
const pageCount = computed(() =>
  effPageSize.value > 0 ? Math.max(1, Math.ceil(itemCount.value / effPageSize.value)) : 1
);
/**
 * 页码钳制：抽屉刷新后条数变少（删一版档位、删一条计划），
 * 页码可能落到区间外。
 *
 * ⚠️ 数据**不要自己 slice**：`remote=false` 时 NDataTable 内部已经按 page/pageSize
 * 对 data 做 slice（`use-table-data.mjs` 的 `paginatedDataRef`），并且自己把 page
 * 钳到合法区间、itemCount 直接取 data.length。这里再 slice 一次就是双重分页，
 * 第 2 页必然空白。我们只负责维护 page 状态，把完整 data 交给它。
 */
const safePage = computed(() => Math.min(page.value, pageCount.value));

/**
 * 当前页大小必须出现在选项里，否则 NSelect 显示空值。
 *
 * 传**数字数组**而不是 `{label, value}`：naive-ui 对数字会自己拼
 * `${size} / ${locale.selectionSuffix}`（即「10 / 条/页」），传对象则原样用 label。
 * 列表页 `createTablePagination` 用的是数字数组，这里跟着用才能长得一样。
 */
const sizeValues = computed(() => Array.from(new Set([effPageSize.value, ...SIZE_PRESETS])).sort((a, b) => a - b));

const pagination = computed<PaginationProps>(() => ({
  page: safePage.value,
  pageSize: effPageSize.value,
  showSizePicker: true,
  pageSizes: sizeValues.value,
  // 与列表页 createTablePagination 的 prefix 文案一致
  prefix: () => `共 ${itemCount.value} 条`,
  onUpdatePage: (p: number) => {
    page.value = p;
  },
  onUpdatePageSize: (s: number) => {
    sizeOverride.value = s;
    page.value = 1;
  }
}));

/**
 * 列宽和喂 `scroll-x`（铁律 4.11：改任何列宽都要同步，偏小会让浏览器压列、内容折行）。
 *
 * 这里改成自动求和，就是为了消掉「三处手写常量 + 改列忘改常量」的漂移：
 * - 有列用了 `minWidth` ⇒ 这张表本来就要自适应，不传 scroll-x（伪造精确和反而会压列）
 * - 有列没给 `width` ⇒ 同上，返回 undefined
 * - 全部列都有明确 width ⇒ 求和
 */
const scrollX = computed(() => {
  const cols = props.columns as Array<{ width?: number | string; minWidth?: number | string }>;
  if (!cols.length) return undefined;
  if (cols.some(c => c.minWidth != null)) return undefined;
  const widths = cols.map(c => Number(c.width));
  if (widths.some(w => !Number.isFinite(w) || w <= 0)) return undefined;
  return widths.reduce((s, w) => s + w, 0);
});
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="data"
    :pagination="effPageSize > 0 ? pagination : false"
    :bordered="false"
    :scroll-x="scrollX"
    class="vm-data-table"
  />
</template>

<style scoped>
/*
 * 单元格不折行（与列表页 index.vue 同一规则），超出走横向滚动。
 * 必须用 :deep()：NDataTable 的 th/td 是子组件渲染的，scoped 属性加不到它们身上。
 * 也必须在组件内部自带——抽屉 teleport 到 body，父级 index.vue 的 scoped 兜不到这里。
 */
.vm-data-table :deep(.n-data-table-th),
.vm-data-table :deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
