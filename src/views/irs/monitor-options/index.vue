<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchMonitorOptions } from '@/service/api';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsMonitorOptionsPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.MonitorOption[]>([]);
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

// 数值筛选字段以 string 存储，查询时转换为 number
const searchParams = reactive({
  symbol: undefined as string | undefined,
  underlying_symbol: undefined as string | undefined,
  underlying_name: undefined as string | undefined,
  option_type: undefined as string | undefined,
  days_left: undefined as string | undefined
});

// 拉取期权监测列表
async function fetchData() {
  loading.value = true;
  try {
    // 数值字段单独转换，避免字符串传入后端
    const { days_left, ...rest } = searchParams;
    const { data, error } = await fetchMonitorOptions({
      ...rest,
      days_left: days_left ? Number(days_left) : undefined,
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
  Object.keys(searchParams).forEach(k => ((searchParams as any)[k] = undefined));
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

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  { title: '期权代码', key: 'symbol', width: 100 },
  { title: '类型', key: 'option_type', width: 60 },
  { title: '标的代码', key: 'underlying_symbol', width: 100 },
  { title: '标的名称', key: 'underlying_name', width: 120 },
  { title: '期权现价', key: 'price', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.price) },
  { title: '标的现价', key: 'price_ud', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.price_ud) },
  { title: '时间价值', key: 'value_t', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.value_t) },
  { title: '内在价值', key: 'value_i', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.value_i) },
  { title: '行权价', key: 'option_price_strike', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.option_price_strike) },
  { title: '剩余天数', key: 'option_days_left', width: 80 },
  { title: '平值度%', key: 'atm_i', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.atm_i) },
  { title: '时间占比%', key: 'ratio_t', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.ratio_t) },
  { title: '内在占比%', key: 'ratio_i', width: 100, render: (row: Api.Irs.MonitorOption) => fmt(row.ratio_i) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left">
        <NFormItem label="期权代码">
          <NInput v-model:value="searchParams.symbol" placeholder="请输入期权代码" clearable />
        </NFormItem>
        <NFormItem label="标的代码">
          <NInput v-model:value="searchParams.underlying_symbol" placeholder="请输入标的代码" clearable />
        </NFormItem>
        <NFormItem label="标的名称">
          <NInput v-model:value="searchParams.underlying_name" placeholder="请输入标的名称" clearable />
        </NFormItem>
        <NFormItem label="类型">
          <NInput v-model:value="searchParams.option_type" placeholder="请输入类型" clearable />
        </NFormItem>
        <NFormItem label="剩余天数">
          <NInput v-model:value="searchParams.days_left" placeholder="请输入剩余天数" clearable />
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
