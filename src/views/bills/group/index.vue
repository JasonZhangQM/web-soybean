<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchGroups, syncGroup } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { useSymbolSearch } from '@/hooks/common/symbol-search';

defineOptions({ name: 'BillsGroupPage' });

const billsStore = useBillsStore();
// 代码远程搜索（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bills.Group[]>([]);
const total = ref(0);

// 分页配置：使用 remote 模式，由后端返回数据
const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  itemCount: 0,
  prefix: () => `共 ${total.value} 条`
});

// 筛选参数：account/category 多选精确匹配，symbol 远程搜索选中代码
const searchParams = reactive<{ account?: string[]; category?: string[]; symbol?: string | null }>({});

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroups({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      total.value = data.total;
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
  searchParams.account = undefined;
  searchParams.category = undefined;
  searchParams.symbol = null;
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

// 盈亏率渲染：保留两位小数并追加百分号
function renderRate(row: Api.Bills.Group, key: string) {
  const val = (row as any)[key];
  return val != null ? `${Number(val).toFixed(2)}%` : '-';
}

const columns = [
  { title: '账户', key: 'account', width: 120 },
  { title: '交易分类', key: 'category', width: 80 },
  { title: '代码', key: 'symbol', width: 120 },
  { title: '持仓', key: 'p_total', width: 100, render: (row: Api.Bills.Group) => renderAmount(row, 'p_total') },
  { title: '持仓成本', key: 'cost_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'cost_total') },
  { title: '市值', key: 'value_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'value_total') },
  { title: '浮动盈亏', key: 'pf_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pf_total') },
  { title: '平仓盈亏', key: 'pl_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pl_total') },
  { title: '盈亏合计', key: 'pfl_all', width: 100, render: (row: Api.Bills.Group) => renderRate(row, 'pfl_all') },
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
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="账户">
          <NSelect
            v-model:value="searchParams.account"
            :options="accountOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 110px"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="代码">
          <NSelect
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :loading="symbolLoading"
            filterable
            remote
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 200px"
            @search="handleSymbolSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
            <NButton type="primary" :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步
            </NButton>
          </NSpace>
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
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
