<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchValueMonitor } from '@/service/api';

defineOptions({ name: 'IrsValueMonitorPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.MonitorValue[]>([]);
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

// 拉取估值监测列表（接口内部已自动同步，无需手动触发）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchValueMonitor({
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

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  { title: '代码', key: 'symbol_value_symbol', width: 100 },
  { title: '最新价', key: 'price', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.price) },
  { title: '阶段高', key: 'rh', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.rh) },
  { title: '低', key: 'symbol_value_pp_l', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_pp_l) },
  { title: '中', key: 'symbol_value_pp_m', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_pp_m) },
  { title: '高', key: 'symbol_value_pp_h', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_pp_h) },
  { title: '买点1', key: 'symbol_value_bg_p_bid1', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_bg_p_bid1) },
  { title: '买点2', key: 'symbol_value_bg_p_bid2', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_bg_p_bid2) },
  { title: '买点3', key: 'symbol_value_bg_p_bid3', width: 100, render: (row: Api.Irs.MonitorValue) => fmt(row.symbol_value_bg_p_bid3) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
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
