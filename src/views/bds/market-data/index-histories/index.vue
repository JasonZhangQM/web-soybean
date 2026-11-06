<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchIndexHistories, fetchSymbolInfos } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IndexHistoriesPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.IndexHistory[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 代码下拉：远程搜索（数据源 bds_symbol_info，按代码/名称/拼音模糊匹配）
const symbolOptions = ref<Array<{ label: string; value: string }>>([]);
const symbolLoading = ref(false);

// 标的类型选项：不选 = 全部（个股 + 指数）
const typeOptions = [
  { label: '个股', value: 'stock' as const },
  { label: '指数', value: 'index' as const }
];

const searchParams = reactive<{
  symbol?: string | null;
  sec_type?: 'stock' | 'index' | null;
  start_date?: string | null;
}>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

/** 远程搜索证券信息，最多返回 50 条作为下拉候选 */
async function handleSymbolSearch(query: string) {
  if (!query) {
    symbolOptions.value = [];
    return;
  }
  symbolLoading.value = true;
  try {
    const { data, error } = await fetchSymbolInfos({ keyword: query, limit: 50 });
    if (!error) {
      symbolOptions.value = (data.items ?? []).map(item => ({
        label: `${item.symbol} ${item.name}`,
        value: item.symbol
      }));
    }
  } finally {
    symbolLoading.value = false;
  }
}

/** 回填当前选中代码的显示名（会话恢复/刷新后 NSelect 需要对应的 option 才显示） */
async function ensureSelectedSymbolOption() {
  if (!searchParams.symbol) return;
  const { data, error } = await fetchSymbolInfos({ symbol: searchParams.symbol, limit: 1 });
  const item = !error ? data.items?.[0] : null;
  if (item) {
    symbolOptions.value = [{ label: `${item.symbol} ${item.name}`, value: item.symbol }];
  }
}

// 拉取历史行情列表（个股 + 指数）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchIndexHistories({
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
      sec_type: searchParams.sec_type || undefined,
      start_date: searchParams.start_date || undefined,
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

// 重置搜索条件并刷新
function handleReset() {
  searchParams.symbol = null;
  searchParams.sec_type = null;
  searchParams.start_date = null;
  symbolOptions.value = [];
  pagination.page = 1;
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

// 数值格式化：后端 Decimal 字段返回字符串，需 Number() 转换后保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// 类型标签：存量行 sec_type 为空，由后端统一返回 index
function typeLabel(row: Api.Bds.IndexHistory) {
  return row.sec_type === 'stock' ? '个股' : '指数';
}

const columns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '名称', key: 'sec_name', width: 130 },
  {
    title: '类型',
    key: 'sec_type',
    width: 90,
    render: (row: Api.Bds.IndexHistory) => typeLabel(row)
  },
  { title: '交易日期', key: 'trade_date', width: 120 },
  { title: '开盘价', key: 'open', width: 120, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.open) },
  { title: '最高价', key: 'high', width: 120, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.high) },
  { title: '最低价', key: 'low', width: 120, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.low) },
  { title: '收盘价', key: 'close', width: 120, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.close) },
  { title: '成交额', key: 'amount', width: 140, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.amount) },
  { title: '成交量', key: 'volume', width: 140, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.volume) },
  { title: '持仓量', key: 'position', width: 140, align: 'right' as const, render: (row: Api.Bds.IndexHistory) => fmtNum(row.position) }
];

onMounted(async () => {
  await ensureSelectedSymbolOption();
  await fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NSelect
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :loading="symbolLoading"
            filterable
            remote
            clearable
            placeholder="输入代码 / 名称搜索"
            style="width: 220px"
            @search="handleSymbolSearch"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="searchParams.sec_type"
            :options="typeOptions"
            clearable
            placeholder="全部"
            style="width: 120px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="交易起始日">
          <NDatePicker
            v-model:formatted-value="searchParams.start_date"
            type="date"
            value-format="yyyy-MM-dd"
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
            @update:formatted-value="handleSearch"
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
      <NAlert type="info" :bordered="false" class="mb-12px">
        价格口径：个股为后复权（仅新增行写入，历史行不重刷），指数为不复权。
      </NAlert>
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
