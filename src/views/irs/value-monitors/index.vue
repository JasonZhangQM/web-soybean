<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchValueMonitors } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IrsValueMonitorsPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.ValueMonitor[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

const searchParams = reactive({
  symbol: '' as string,
  name: '' as string
});

// 拉取估值监测列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchValueMonitors({
      symbol: searchParams.symbol || undefined,
      name: searchParams.name || undefined,
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
  searchParams.symbol = '';
  searchParams.name = '';
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

// 估值价字段保留四位小数（Numeric(12,4)），空值显示 '-'
const fmt4 = (v: number | null) => (v != null ? Number(v).toFixed(4) : '-');
// 百分比字段保留两位小数（Numeric(9,2)），空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  { title: '名称', key: 'name', width: 100, fixed: 'left' },
  // 估值区间
  { title: '极低', key: 'pp_el', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_el) },
  { title: '低', key: 'pp_l', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_l) },
  { title: '中', key: 'pp_m', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_m) },
  { title: '高', key: 'pp_h', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_h) },
  { title: '极高', key: 'pp_eh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.pp_eh) },
  // 行情字段
  { title: '上年末', key: 'py_close', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.py_close) },
  { title: '年高', key: 'y_high', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.y_high) },
  { title: '年低', key: 'y_low', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.y_low) },
  { title: '最新价', key: 'price', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt4(row.price) },
  // 行情监测字段
  { title: '年高(%)', key: 'pv_yh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yh) },
  { title: '年低(%)', key: 'pv_yl', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yl) },
  { title: '最新(%)', key: 'pv_yy', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_yy) },
  // 估值监测字段
  { title: '极低(%)', key: 'pv_el', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_el) },
  { title: '低(%)', key: 'pv_l', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_l) },
  { title: '中(%)', key: 'pv_m', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_m) },
  { title: '高(%)', key: 'pv_h', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_h) },
  { title: '极高(%)', key: 'pv_eh', width: 80, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_eh) },
  // 估值监测年化字段
  { title: '极低(y%)', key: 'pv_el_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_el_y) },
  { title: '低(y%)', key: 'pv_l_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_l_y) },
  { title: '中(y%)', key: 'pv_m_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_m_y) },
  { title: '高(y%)', key: 'pv_h_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_h_y) },
  { title: '极高(y%)', key: 'pv_eh_y', width: 90, render: (row: Api.Irs.ValueMonitor) => fmt(row.pv_eh_y) }
];

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NInput
            v-model:value="searchParams.symbol"
            clearable
            placeholder="请输入代码"
            style="width: 160px"
          />
        </NFormItem>
        <NFormItem label="名称">
          <NInput
            v-model:value="searchParams.name"
            clearable
            placeholder="请输入名称"
            style="width: 160px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
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
