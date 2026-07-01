<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchTradeDates, syncTradeDate } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';

defineOptions({ name: 'TradeDatesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.TradeDate[]>([]);
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

// 拉取交易日历列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchTradeDates({
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

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// 触发后端同步交易日历（executeSync 内置进度条/防重复/结果通知）
async function handleSync() {
  await executeSync(syncTradeDate, syncLoading, fetchData);
}

const columns = [
  { title: 'ID', key: 'id', width: 80 },
  { title: '交易日', key: 'trade_date' },
  { title: '创建时间', key: 'create_time' },
  { title: '更新时间', key: 'update_time' }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper">
      <NSpace class="mb-16px">
        <NButton type="primary" :loading="syncLoading" @click="handleSync">
          <template #icon><SvgIcon icon="mdi:sync" /></template>
          同步
        </NButton>
      </NSpace>
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
