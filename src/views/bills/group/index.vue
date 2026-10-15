<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import { fetchGroups, syncGroup, updateGroup } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
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

// 筛选参数：account/category 单选精确匹配，symbol NAutoComplete 支持直接输入提交
const searchParams = reactive<{
  account?: string | null;
  category?: string | null;
  symbol?: string;
  value_only?: boolean;
}>({ value_only: true });

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroups({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      account: searchParams.account || undefined,
      category: searchParams.category || undefined,
      // NAutoComplete 清空返回空串，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
      // 仅在选中"不为0"时传递该参数
      value_only: searchParams.value_only === true ? true : undefined,
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
  searchParams.symbol = '';
  searchParams.value_only = false;
  clearSymbolOptions();
  fetchData();
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
    title: '代码',
    key: 'symbol',
    width: 160,
    render: (row: Api.Bills.Group) =>
      h(NButton, { text: true, type: 'primary', onClick: () => handleEdit(row) }, { default: () => row.symbol })
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
            placeholder="单选精确匹配"
            style="width: 110px"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            clearable
            placeholder="单选精确匹配"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="代码">
          <NAutoComplete
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :render-label="renderSymbolLabel"
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 200px"
            @update:value="handleSymbolSearch"
          />
        </NFormItem>
        <NFormItem label="当前市值">
          <NRadioGroup v-model:value="searchParams.value_only">
            <NRadio :value="false">全部</NRadio>
            <NRadio :value="true">不为0</NRadio>
          </NRadioGroup>
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton type="primary" :loading="syncLoading" @click="handleSync">
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
          <NButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
