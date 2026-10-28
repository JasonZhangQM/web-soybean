<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { fetchGroups, syncGroup, updateGroup } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsGroupPage' });

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
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bills.Group[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 筛选参数：account/category 单选精确匹配，变更即搜索；
// keyword 为合并搜索框——代码或名称任一模糊命中即可（后端 OR），回车立即搜索、清空立即重搜；
// value_filter 为市值筛选（与 0 比较），默认 ne = 不为 0，清空 = 全部
type ValueFilter = 'gt' | 'lt' | 'eq' | 'ne';

const searchParams = reactive<{
  account?: string | null;
  category?: string | null;
  keyword?: string;
  value_filter?: ValueFilter | null;
}>({ value_filter: 'ne' });
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

// 市值筛选：按 value_total 与 0 比较，与后端 value_filter 取值一一对应
const valueFilterOptions: Array<{ label: string; value: ValueFilter }> = [
  { label: '大于0', value: 'gt' },
  { label: '小于0', value: 'lt' },
  { label: '等于0', value: 'eq' },
  { label: '不为0', value: 'ne' }
];

async function fetchData() {
  loading.value = true;
  try {
    // 显式列出字段而不是展开 searchParams：会话记忆里可能残留旧版本字段（symbol），
    // 展开会把它们一并传给后端，导致筛选条件被隐藏地叠加
    const { data, error } = await fetchGroups({
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      account: searchParams.account || undefined,
      category: searchParams.category || undefined,
      // 合并搜索框清空返回空串
      keyword: searchParams.keyword || undefined,
      // 市值筛选（与 0 比较）
      value_filter: searchParams.value_filter || undefined,
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
  // 市值筛选默认「不为0」
  searchParams.value_filter = 'ne';
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

async function handleSync() {
  await executeSync(syncGroup, syncLoading, fetchData);
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Group, key: string) {
  const val = (row as any)[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 盈亏合计 = 浮动盈亏 + 平仓盈亏 + 其他损益 + 融资利息（前端计算，Group 表不落库该字段）
function renderPflAll(row: Api.Bills.Group) {
  const sum =
    (Number(row.pf_total) || 0) +
    (Number(row.pl_total) || 0) +
    (Number(row.pl_t_other) || 0) +
    (Number(row.pl_t_br) || 0);
  return sum.toFixed(2);
}

// 最新价：保留 4 位小数，null 显示 '-'
function renderPrice(row: Api.Bills.Group) {
  const val = row.price;
  return val != null ? Number(val).toFixed(4) : '-';
}

// 乘数：整数显示，null 显示 '-'
function renderMultiplier(row: Api.Bills.Group) {
  const val = row.multiplier;
  return val != null ? String(val) : '-';
}

// ===== 编辑弹窗 =====

const editingId = ref<number | null>(null);
const editingLabel = ref<string>('');
const showModal = ref(false);
const submitLoading = ref(false);

const formData = reactive({
  profit_time: null as string | null,
  value_time: null as string | null
});

// 格式化 datetime 字符串：去掉 'T' 换成空格，截取到秒
function fmtDateTime(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace('T', ' ').slice(0, 19);
}

function handleEdit(row: Api.Bills.Group) {
  editingId.value = row.id;
  editingLabel.value = `${row.account ?? ''}·${row.category}·${row.symbol}`;
  formData.profit_time = fmtDateTime(row.profit_time);
  formData.value_time = fmtDateTime(row.value_time);
  showModal.value = true;
}

function handleCancel() {
  showModal.value = false;
  editingId.value = null;
  editingLabel.value = '';
  formData.profit_time = null;
  formData.value_time = null;
}

async function handleSubmit() {
  if (editingId.value === null) return;
  submitLoading.value = true;
  try {
    const payload: { profit_time?: string | null; value_time?: string | null } = {};
    if (formData.profit_time !== null) payload.profit_time = formData.profit_time;
    if (formData.value_time !== null) payload.value_time = formData.value_time;
    const { error } = await updateGroup(editingId.value, payload);
    if (!error) {
      window.$message?.success('修改成功');
      showModal.value = false;
      fetchData();
    }
  } finally {
    submitLoading.value = false;
  }
}

const columns = [
  {
    // 代码同时是操作入口：点击打开时间戳编辑弹窗。
    // ⚠️ 用 span 而不是 NButton：naive-ui 按钮样式带 user-select:none，代码没法选中复制
    title: '代码',
    key: 'symbol',
    width: 160,
    render: (row: Api.Bills.Group) =>
      h(
        'span',
        {
          class: 'cursor-pointer whitespace-nowrap text-primary hover:underline',
          style: 'user-select: text',
          title: '点击编辑时间戳（可拖选代码复制）',
          onClick: () => {
            // 拖选文字后也会派发 click：有选区就不弹窗，否则选完立刻被弹窗打断
            if (window.getSelection()?.toString()) return;
            handleEdit(row);
          }
        },
        row.symbol
      )
  },
  { title: '账户', key: 'account', width: 80 },
  { title: '交易分类', key: 'category', width: 80 },
  { title: '持仓', key: 'p_total', width: 100, render: (row: Api.Bills.Group) => renderAmount(row, 'p_total') },
  {
    title: '持仓成本',
    key: 'cost_total',
    width: 120,
    render: (row: Api.Bills.Group) => renderAmount(row, 'cost_total')
  },
  { title: '最新价', key: 'price', width: 100, render: (row: Api.Bills.Group) => renderPrice(row) },
  { title: '乘数', key: 'multiplier', width: 80, render: (row: Api.Bills.Group) => renderMultiplier(row) },
  { title: '市值', key: 'value_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'value_total') },
  { title: '浮动盈亏', key: 'pf_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pf_total') },
  { title: '平仓盈亏', key: 'pl_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pl_total') },
  {
    title: '其他损益',
    key: 'pl_t_other',
    width: 120,
    render: (row: Api.Bills.Group) => renderAmount(row, 'pl_t_other')
  },
  { title: '融资利息', key: 'pl_t_br', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pl_t_br') },
  { title: '盈亏合计', key: 'pfl_all', width: 100, render: renderPflAll },
  { title: '交易次数', key: 'count', width: 80 }
];

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
        <NFormItem label="市值">
          <NSelect
            v-model:value="searchParams.value_filter"
            :options="valueFilterOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
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
            style="width: 260px"
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
        <NFormItem class="ml-auto">
          <NButton :loading="syncLoading" @click="handleSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            行情
          </NButton>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :default-sort="[
          { columnKey: 'symbol', order: 'ascend' },
          { columnKey: 'account', order: 'ascend' }
        ]"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- ===== Group 时间编辑弹窗 ===== -->
    <NModal v-model:show="showModal" preset="card" title="编辑时间戳" class="w-520px" :mask-closable="false">
      <div style="margin-bottom: 12px; color: #666; font-size: 13px">
        {{ editingLabel }}
      </div>
      <NForm :model="formData" label-placement="left" label-width="120px">
        <NFormItem label="收益试算时间">
          <NDatePicker
            v-model:formatted-value="formData.profit_time"
            type="datetime"
            value-format="yyyy-MM-dd HH:mm:ss"
            clearable
            class="w-full"
          />
        </NFormItem>
        <NFormItem label="市值更新时间">
          <NDatePicker
            v-model:formatted-value="formData.value_time"
            type="datetime"
            value-format="yyyy-MM-dd HH:mm:ss"
            clearable
            class="w-full"
          />
        </NFormItem>
        <div style="color: #999; font-size: 12px; margin-top: 4px">
          注：以上时间戳为收益试算/市值更新的完成时间，不改变实际盈亏和市值数据。
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleCancel">取消</NButton>
          <NButton :loading="submitLoading" @click="handleSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
