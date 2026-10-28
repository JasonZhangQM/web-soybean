<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchProfits } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsProfitsPage' });

const billsStore = useBillsStore();
// 代码远程搜索（NAutoComplete，防抖 300ms）
const { symbolOptions: rawSymbolOptions, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

// NAutoComplete 选中后 v-model = option.label，所以 label 必须设为纯 symbol
// display 字段保留下拉列表的富文本（symbol name (industry)），通过 renderLabel 渲染
const symbolOptions = computed(() =>
  rawSymbolOptions.value.map(o => ({ label: o.value, value: o.value, display: o.label }))
);

// 自定义下拉项渲染：显示 "symbol name (industry)"，但选中后 v-model 只拿到纯 symbol
function renderSymbolLabel(option: any) {
  return option.display || option.label;
}

const loading = ref(false);
const tableData = ref<Api.Bills.Profit[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 筛选参数：account/category 单选精确匹配，变更即搜索；
// keyword 为合并搜索框——代码与名称任一模糊命中即可（后端 OR），回车立即搜索、清空立即重搜
const searchParams = reactive<{
  account?: string | null;
  category?: string | null;
  keyword?: string;
}>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    // 显式列出字段而不是展开 searchParams：会话记忆里可能残留旧版本字段（symbol），
    // 展开会把它们一并传给后端，导致筛选条件被隐藏地叠加
    const { data, error } = await fetchProfits({
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      account: searchParams.account || undefined,
      category: searchParams.category || undefined,
      // 合并搜索框清空返回空串
      keyword: searchParams.keyword || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      pagination.itemCount = data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.account = null;
  searchParams.category = null;
  searchParams.keyword = '';
  clearSymbolOptions();
  pagination.page = 1;
  fetchData();
}

/**
 * 合并搜索框输入变化：同步刷新代码候选下拉；清空时立即重新搜索
 * （输入过程中不搜索，避免每敲一个字就打一次接口，回车才搜）
 */
function handleKeywordChange(value: string | null) {
  const keyword = value ?? '';
  handleSymbolSearch(keyword);
  if (!keyword) handleSearch();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Profit, key: keyof Api.Bills.Profit) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 单元格不换行，列宽按实测最长内容放宽，超出容器的部分交给表格横向滚动。
// 刻意不用 column.ellipsis.tooltip：NDataTable 会给每个单元格包一层带
// ResizeObserver 的 Tooltip 容器，20 行 × 12 列 = 240 个实例，是渲染卡顿的主因。
// 本页字段都是短内容（时间 19 字符、代码/名称/数值均更短），放宽列宽即可完整显示。
function renderAmountCol(key: keyof Api.Bills.Profit) {
  return (row: Api.Bills.Profit) => renderAmount(row, key);
}

const columns = [
  { title: '交易时间', key: 'trade_time', width: 180 },
  { title: '代码', key: 'symbol', width: 120 },
  { title: '名称', key: 'name', width: 130 },
  { title: '多头持仓', key: 'p_long', width: 100, render: renderAmountCol('p_long') },
  { title: '空头持仓', key: 'p_short', width: 100, render: renderAmountCol('p_short') },
  { title: '多头成本', key: 'cost_t_long', width: 120, render: renderAmountCol('cost_t_long') },
  { title: '空头成本', key: 'cost_t_short', width: 120, render: renderAmountCol('cost_t_short') },
  { title: '平仓盈亏l', key: 'pl_long', width: 120, render: renderAmountCol('pl_long') },
  { title: '平仓盈亏s', key: 'pl_short', width: 120, render: renderAmountCol('pl_short') },
  { title: '其他损益', key: 'pl_other', width: 120, render: renderAmountCol('pl_other') },
  { title: '入金净额', key: 'diff_dw', width: 120, render: renderAmountCol('diff_dw') },
  { title: '账户', key: 'account', width: 90 }
];

// 表格总宽 = 列宽之和，避免硬编码与列宽脱节
const scrollX = columns.reduce((sum, col) => sum + col.width, 0);

onMounted(() => {
  fetchData();
  // 确保类别/账户列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
  billsStore.loadAccounts();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="账户">
          <NSelect
            v-model:value="searchParams.account"
            :options="accountOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            clearable
            placeholder="全部"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="代码/名称">
          <NAutoComplete
            v-model:value="searchParams.keyword"
            :options="symbolOptions"
            :render-label="renderSymbolLabel"
            clearable
            placeholder="代码或名称，回车搜索"
            style="width: 200px"
            @update:value="handleKeywordChange"
            @keyup.enter="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :scroll-x="scrollX"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>

<style scoped>
/*
 * 单元格一律不折行：列宽已按实测最长内容放宽，超出容器的部分由表格横向滚动接管。
 * :deep() 是必须的：th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
