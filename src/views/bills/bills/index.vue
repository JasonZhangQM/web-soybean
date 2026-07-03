<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchBills, batchImportBills } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { executeSync } from '@/utils/sync-feedback';

defineOptions({ name: 'BillsListPage' });

const loading = ref(false);
// 导入专用 loading：与表格 loading 分离，避免导入过程中表格闪烁
const importLoading = ref(false);
const tableData = ref<Api.Bills.Bill[]>([]);
const total = ref(0);

// 分页配置：使用 remote 模式，由后端返回数据
const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  itemCount: 0,
  prefix: () => `共 ${total.value} 条`
});

// 筛选参数：account/category 精确匹配，symbol/name 模糊匹配
const searchParams = reactive<{ account?: string; category?: string; symbol?: string; name?: string }>({});

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchBills({
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
  searchParams.account = undefined;
  searchParams.category = undefined;
  searchParams.symbol = undefined;
  searchParams.name = undefined;
  fetchData();
}

// 触发后端账单批量导入（executeSync 内置进度条/防重复/结果通知）
async function handleImport() {
  await executeSync(batchImportBills, importLoading, fetchData);
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
  // 交易时间截取前 19 位（去掉毫秒/时区部分）
  { title: '交易时间', key: 'trade_time', width: 160, render: (row: Api.Bills.Bill) => row.trade_time?.slice(0, 19) ?? '-' },
  { title: '代码', key: 'symbol', width: 100 },
  { title: '名称', key: 'name', width: 120 },
  { title: '总分类', key: 'category', width: 80 },
  { title: '一级分类', key: 'category1', width: 80 },
  { title: '买/卖', key: 'b_s', width: 60 },
  { title: '沽/购', key: 'c_p', width: 60 },
  { title: '开/平', key: 'o_c', width: 60 },
  { title: '成交价', key: 'price', width: 100, render: (row: Api.Bills.Bill) => Number(row.price).toFixed(2) },
  { title: '成交量', key: 'vol', width: 80 },
  { title: '成交额', key: 'amount', width: 120, render: (row: Api.Bills.Bill) => Number(row.amount).toFixed(2) },
  { title: '发生额', key: 'amount_act', width: 120, render: (row: Api.Bills.Bill) => Number(row.amount_act).toFixed(2) },
  { title: '税费合计', key: 'fee_tax', width: 120, render: (row: Api.Bills.Bill) => Number(row.fee_tax).toFixed(2) },
  { title: '账户', key: 'account', width: 100 }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left">
        <NFormItem label="账户">
          <NInput v-model:value="searchParams.account" placeholder="精确匹配" clearable />
        </NFormItem>
        <NFormItem label="类别">
          <NInput v-model:value="searchParams.category" placeholder="精确匹配" clearable />
        </NFormItem>
        <NFormItem label="代码">
          <NInput v-model:value="searchParams.symbol" placeholder="模糊匹配" clearable />
        </NFormItem>
        <NFormItem label="名称">
          <NInput v-model:value="searchParams.name" placeholder="模糊匹配" clearable />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
            <NButton type="info" :loading="importLoading" @click="handleImport">导入</NButton>
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
