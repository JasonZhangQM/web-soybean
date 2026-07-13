<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchIndexHistories, syncIndexHistory } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';

defineOptions({ name: 'IndexHistoriesPage' });

const bdsStore = useBdsStore();
// 指数代码下拉选项（来自全局 store 缓存，由后端 Config.INDEX_CODE 字典提供）
const symbolOptions = bdsStore.getIndexCodeOptions();

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.IndexHistory[]>([]);
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

// 搜索参数：symbol 多选精确匹配，start_date 开始日期
const searchParams = reactive<{
  symbol?: string[];
  start_date?: string | null;
}>({});

// 拉取指数历史行情列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchIndexHistories({
      symbol: searchParams.symbol,
      start_date: searchParams.start_date || undefined,
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
  searchParams.symbol = undefined;
  searchParams.start_date = null;
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

// 触发后端同步指数历史行情
async function handleSync() {
  await executeSync(syncIndexHistory, syncLoading, fetchData);
}

// 数值格式化：后端 Decimal 字段返回字符串，需 Number() 转换后保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

const columns = [
  { title: '代码', key: 'symbol', width: 120 },
  { title: '指数名称', key: 'sec_name', width: 120 },
  { title: '交易日期', key: 'trade_date', width: 120 },
  { title: '开盘价', key: 'open', width: 120, render: (row: Api.Bds.IndexHistory) => fmtNum(row.open) },
  { title: '最高价', key: 'high', width: 120, render: (row: Api.Bds.IndexHistory) => fmtNum(row.high) },
  { title: '最低价', key: 'low', width: 120, render: (row: Api.Bds.IndexHistory) => fmtNum(row.low) },
  { title: '收盘价', key: 'close', width: 120, render: (row: Api.Bds.IndexHistory) => fmtNum(row.close) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NSelect
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 150px"
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
