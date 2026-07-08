<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchSymbolInfos, syncSymbolInfo } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'SymbolInfosPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.SymbolInfo[]>([]);
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

// 搜索参数：symbol/name 模糊，industry 精确
const searchParams = reactive({
  symbol: '',
  name: '',
  industry: ''
});

// 拉取证券信息列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchSymbolInfos({
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

// 重置搜索条件并刷新
function handleReset() {
  searchParams.symbol = '';
  searchParams.name = '';
  searchParams.industry = '';
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

// 触发后端同步证券信息（executeSync 内置进度条/防重复/结果通知）
async function handleSync() {
  await executeSync(syncSymbolInfo, syncLoading, fetchData);
}

// 数值格式化：后端 Decimal 字段返回字符串，需 Number() 转换后保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

const columns = [
  { title: 'ID', key: 'id', width: 80 },
  { title: '代码', key: 'symbol', width: 100 },
  { title: '名称', key: 'name', width: 120 },
  { title: '所属行业', key: 'industry', width: 100 },
  { title: '上市日期', key: 'online_date', width: 120 },
  { title: '最新价', key: 'price', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.price) },
  { title: '涨幅%', key: 'rate', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.rate) },
  { title: 'PE(TTM)', key: 'pe_ttm', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.pe_ttm) },
  { title: 'PB', key: 'pb', width: 80, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.pb) },
  { title: '股息(TTM%)', key: 'dy_ttm', width: 120, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.dy_ttm) },
  { title: 'ROE(%)', key: 'roe', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.roe) },
  { title: '创建时间', key: 'create_time', width: 180 }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NInput v-model:value="searchParams.symbol" placeholder="代码模糊匹配" clearable />
        </NFormItem>
        <NFormItem label="名称">
          <NInput v-model:value="searchParams.name" placeholder="名称模糊匹配" clearable />
        </NFormItem>
        <NFormItem label="行业">
          <NInput v-model:value="searchParams.industry" placeholder="行业精确匹配" clearable />
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
