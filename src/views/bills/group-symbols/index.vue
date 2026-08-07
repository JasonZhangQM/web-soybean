<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchGroupSymbols, syncGroup } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsGroupSymbolsPage' });

const billsStore = useBillsStore();
// 代码远程搜索（NAutoComplete，防抖 300ms）
const { symbolOptions: rawSymbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

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
const tableData = ref<Api.Bills.GroupSymbol[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 筛选参数：category 单选精确匹配，symbol NAutoComplete 支持直接输入提交，value_only 控制当前市值不为0
const searchParams = reactive<{ category?: string | null; symbol?: string; value_only?: boolean }>({ value_only: true });

// 类别下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroupSymbols({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
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
function renderAmount(row: Api.Bills.GroupSymbol, key: keyof Api.Bills.GroupSymbol) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 盈亏合计渲染：保留两位小数
function renderRate(row: Api.Bills.GroupSymbol) {
  const val = row.pfl_all;
  return val != null ? Number(val).toFixed(2) : '-';
}

// 最新价：保留 4 位小数，null 显示 '-'
function renderPrice(row: Api.Bills.GroupSymbol) {
  const val = row.price;
  return val != null ? Number(val).toFixed(4) : '-';
}

// 乘数：整数显示，null 显示 '-'
function renderMultiplier(row: Api.Bills.GroupSymbol) {
  const val = row.multiplier;
  return val != null ? String(val) : '-';
}

const columns = [
  { title: '交易分类', key: 'category', width: 80 },
  { title: '代码', key: 'symbol', width: 160 },
  { title: '交易次数', key: 'count', width: 80 },
  { title: '持仓量', key: 'p_total', width: 100, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'p_total') },
  { title: '持仓成本', key: 'cost_total', width: 120, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'cost_total') },
  { title: '最新价', key: 'price', width: 100, render: (row: Api.Bills.GroupSymbol) => renderPrice(row) },
  { title: '乘数', key: 'multiplier', width: 80, render: (row: Api.Bills.GroupSymbol) => renderMultiplier(row) },
  { title: '当前市值', key: 'value_total', width: 120, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'value_total') },
  { title: '浮动盈亏', key: 'pf_total', width: 120, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'pf_total') },
  { title: '平仓盈亏', key: 'pl_all', width: 120, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'pl_all') },
  { title: '盈亏合计', key: 'pfl_all', width: 100, render: renderRate },
  { title: '出入净额', key: 'diff_dw', width: 120, render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'diff_dw') }
];

onMounted(() => {
  fetchData();
  // 确保类别列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
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
