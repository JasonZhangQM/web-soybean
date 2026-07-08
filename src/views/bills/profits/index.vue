<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchProfits } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';

defineOptions({ name: 'BillsProfitsPage' });

const billsStore = useBillsStore();

const loading = ref(false);
const tableData = ref<Api.Bills.Profit[]>([]);
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

// 筛选参数：account/category 多选精确匹配，symbol/name 模糊匹配
const searchParams = reactive<{ account?: string[]; category?: string[]; symbol?: string; name?: string }>({});

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchProfits({
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

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Profit, key: keyof Api.Bills.Profit) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

const columns = [
  { title: '交易时间', key: 'trade_time', width: 160 },
  { title: '代码', key: 'symbol', width: 120 },
  { title: '名称', key: 'name', width: 120 },
  { title: '多头持仓', key: 'p_long', width: 100, render: (row: Api.Bills.Profit) => renderAmount(row, 'p_long') },
  { title: '空头持仓', key: 'p_short', width: 100, render: (row: Api.Bills.Profit) => renderAmount(row, 'p_short') },
  { title: '多头成本', key: 'cost_t_long', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'cost_t_long') },
  { title: '空头成本', key: 'cost_t_short', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'cost_t_short') },
  { title: '平仓盈亏l', key: 'pl_long', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'pl_long') },
  { title: '平仓盈亏s', key: 'pl_short', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'pl_short') },
  { title: '其他损益', key: 'pl_other', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'pl_other') },
  { title: '入金净额', key: 'diff_dw', width: 120, render: (row: Api.Bills.Profit) => renderAmount(row, 'diff_dw') },
  { title: '账户', key: 'account', width: 100 }
];

onMounted(() => {
  fetchData();
  // 确保类别/账户列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
  billsStore.loadAccounts();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="账户">
          <NSelect
            v-model:value="searchParams.account"
            :options="accountOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 110px"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 150px"
          />
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
