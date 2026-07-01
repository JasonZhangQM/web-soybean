<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchSymbolValues, syncIrs } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsSymbolValuesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Irs.SymbolValue[]>([]);
const total = ref(0);

// 分页配置（remote 模式）
const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  itemCount: 0,
  prefix: () => `共 ${total.value} 条`
});

const searchParams = reactive({ symbol: undefined as string | undefined });

// 拉取估值配置列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchSymbolValues({
      ...searchParams,
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
  searchParams.symbol = undefined;
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

// 触发估值配置同步
async function handleSync() {
  await executeSync(() => syncIrs('symbol-value'), syncLoading, fetchData);
}

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  { title: '代码', key: 'symbol', width: 100 },
  { title: '名称', key: 'name', width: 120 },
  { title: '极低', key: 'pp_el', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.pp_el) },
  { title: '低', key: 'pp_l', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.pp_l) },
  { title: '中', key: 'pp_m', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.pp_m) },
  { title: '高', key: 'pp_h', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.pp_h) },
  { title: '极高', key: 'pp_eh', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.pp_eh) },
  { title: '回撤率', key: 'vix', width: 80, render: (row: Api.Irs.SymbolValue) => fmt(row.vix) },
  { title: '总批次', key: 'p_total', width: 80 },
  { title: '总金额', key: 'm_tot', width: 100, render: (row: Api.Irs.SymbolValue) => fmt(row.m_tot) },
  { title: '最新收盘', key: 'last_close', width: 100, render: (row: Api.Irs.SymbolValue) => fmt(row.last_close) },
  { title: '近期高点', key: 'y_high', width: 100, render: (row: Api.Irs.SymbolValue) => fmt(row.y_high) },
  { title: '近期低点', key: 'y_low', width: 100, render: (row: Api.Irs.SymbolValue) => fmt(row.y_low) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left">
        <NFormItem label="代码">
          <NInput v-model:value="searchParams.symbol" placeholder="请输入代码" clearable />
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
