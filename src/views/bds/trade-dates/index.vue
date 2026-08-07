<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchTradeDates, syncTradeDate } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'TradeDatesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.TradeDate[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 日期范围（YYYY-MM-DD 格式字符串元组），与 macro-framework 页面统一
const dateRange = ref<[string, string] | null>(null);

// 拉取交易日历列表
async function fetchData() {
  loading.value = true;
  try {
    const [start_date, end_date] = dateRange.value || [];
    const { data, error } = await fetchTradeDates({
      start_date: start_date || undefined,
      end_date: end_date || undefined,
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
  pagination.page = 1;
  fetchData();
}

// 重置搜索条件并刷新
function handleReset() {
  dateRange.value = null;
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

// 触发后端同步交易日历（executeSync 内置防重复/结果通知）
async function handleSync() {
  await executeSync(syncTradeDate, syncLoading, fetchData);
}

const columns = [
  { title: 'ID', key: 'id', width: 80 },
  { title: '交易日', key: 'trade_date', width: 120 },
  { title: '创建时间', key: 'create_time' },
  { title: '更新时间', key: 'update_time' }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="日期范围">
          <NDatePicker
            v-model:formatted-value="dateRange"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 320px"
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
