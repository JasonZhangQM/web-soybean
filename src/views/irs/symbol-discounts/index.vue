<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchSymbolDiscounts, syncIrs } from '@/service/api';

defineOptions({ name: 'IrsSymbolDiscountsPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.SymbolDiscount[]>([]);
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

const searchParams = reactive({
  symbol_type: undefined as string | undefined,
  is_main: undefined as number | undefined,
  symbol: undefined as string | undefined
});

// 是否主力下拉选项（NSelect 不支持 boolean 值，用 1/0 代替）
const isMainOptions = [
  { label: '是', value: 1 },
  { label: '否', value: 0 }
];

// 拉取贴水配置列表
async function fetchData() {
  loading.value = true;
  try {
    // is_main 用 1/0 映射 boolean，undefined 时不传
    const { is_main, ...rest } = searchParams;
    const isMainBool = is_main === 1 ? true : is_main === 0 ? false : undefined;
    const { data, error } = await fetchSymbolDiscounts({
      ...rest,
      is_main: isMainBool,
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
  searchParams.symbol_type = undefined;
  searchParams.is_main = undefined;
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

// 触发贴水配置同步
async function handleSync() {
  const { error } = await syncIrs('symbol-discount');
  if (!error) {
    window.$message?.success('同步成功');
    fetchData();
  }
}

// 日期截取前 10 位
const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : '-');

const columns = [
  { title: '连续合约', key: 'symbol_con', width: 120 },
  { title: '真实合约', key: 'symbol', width: 120 },
  { title: '类别', key: 'symbol_type', width: 80 },
  { title: '主力', key: 'is_main', width: 60, render: (row: Api.Irs.SymbolDiscount) => (row.is_main ? '是' : '否') },
  { title: '标的代码', key: 'symbol_ud', width: 100 },
  { title: '到期日', key: 'delisted_date', width: 120, render: (row: Api.Irs.SymbolDiscount) => fmtDate(row.delisted_date) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left">
        <NFormItem label="合约类别">
          <NInput v-model:value="searchParams.symbol_type" placeholder="请输入合约类别" clearable />
        </NFormItem>
        <NFormItem label="是否主力">
          <NSelect v-model:value="searchParams.is_main" :options="isMainOptions" placeholder="请选择" clearable />
        </NFormItem>
        <NFormItem label="真实合约">
          <NInput v-model:value="searchParams.symbol" placeholder="请输入真实合约" clearable />
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
