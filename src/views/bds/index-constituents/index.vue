<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchIndexConstituents } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IndexConstituentsPage' });

const bdsStore = useBdsStore();
const indexCodeOptions = bdsStore.getIndexCodeOptions();
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

const loading = ref(false);
const tableData = ref<Api.Bds.IndexConstituent[]>([]);
const pagination = createTablePagination();

const queryForm = reactive<{
  index_code: string | null;
  symbol: string | null;
  trade_date: string | null;
  dedup: boolean;
}>({
  index_code: null,
  symbol: null,
  trade_date: null,
  dedup: false
});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams: queryForm, pagination });

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchIndexConstituents({
      index_code: queryForm.index_code || undefined,
      symbol: queryForm.symbol || undefined,
      trade_date: queryForm.trade_date || undefined,
      dedup: queryForm.dedup || undefined,
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
  trimSearchParams(queryForm);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  queryForm.index_code = null;
  queryForm.symbol = null;
  queryForm.trade_date = null;
  queryForm.dedup = false;
  clearSymbolOptions();
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

const columns = [
  { title: '指数代码', key: 'index_code', width: 120 },
  { title: '指数名称', key: 'sec_name', width: 120 },
  { title: '成分股代码', key: 'symbol', width: 120 },
  { title: '交易日期', key: 'trade_date', width: 120 }
];

onMounted(async () => {
  await bdsStore.loadIndexCodes();
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="指数代码">
          <NSelect
            v-model:value="queryForm.index_code"
            :options="indexCodeOptions"
            clearable
            placeholder="全部"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="成分股代码">
          <NSelect
            v-model:value="queryForm.symbol"
            :options="symbolOptions"
            :loading="symbolLoading"
            filterable
            remote
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 260px"
            @search="handleSymbolSearch"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="交易日期">
          <NDatePicker
            v-model:formatted-value="queryForm.trade_date"
            type="date"
            value-format="yyyy-MM-dd"
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
            @update:formatted-value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="去重">
          <NCheckbox v-model:checked="queryForm.dedup" @update:checked="handleSearch"></NCheckbox>
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
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
