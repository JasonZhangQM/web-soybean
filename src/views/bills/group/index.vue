<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchGroups, syncGroup } from '@/service/api';

defineOptions({ name: 'BillsGroupPage' });

const loading = ref(false);
const tableData = ref<Api.Bills.Group[]>([]);
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

// 筛选参数：account/category 精确匹配，symbol 模糊匹配
const searchParams = reactive<{ account?: string; category?: string; symbol?: string }>({});

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroups({
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
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.account = undefined;
  searchParams.category = undefined;
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

async function handleSync() {
  const { error } = await syncGroup();
  if (!error) {
    window.$message?.success('同步成功');
    fetchData();
  }
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Group, key: string) {
  const val = (row as any)[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 盈亏率渲染：保留两位小数并追加百分号
function renderRate(row: Api.Bills.Group, key: string) {
  const val = (row as any)[key];
  return val != null ? `${Number(val).toFixed(2)}%` : '-';
}

const columns = [
  { title: '账户', key: 'account', width: 120 },
  { title: '类别', key: 'category', width: 80 },
  { title: '代码', key: 'symbol', width: 100 },
  { title: '总持仓', key: 'p_total', width: 100, render: (row: Api.Bills.Group) => renderAmount(row, 'p_total') },
  { title: '总成本', key: 'cost_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'cost_total') },
  { title: '总市值', key: 'value_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'value_total') },
  { title: '总浮盈', key: 'pf_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pf_total') },
  { title: '总平仓盈亏', key: 'pl_total', width: 120, render: (row: Api.Bills.Group) => renderAmount(row, 'pl_total') },
  { title: '总盈亏率', key: 'pfl_all', width: 100, render: (row: Api.Bills.Group) => renderRate(row, 'pfl_all') },
  { title: '成交笔数', key: 'count', width: 80 }
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
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
            <NButton type="primary" :loading="loading" @click="handleSync">
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
