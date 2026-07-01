<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchGroupAccs, syncGroupAcc } from '@/service/api';

defineOptions({ name: 'BillsGroupAccsPage' });

const loading = ref(false);
const tableData = ref<Api.Bills.GroupAcc[]>([]);
const total = ref(0);

// 分页配置：使用 remote 模式，由后端返回数据（此页面无筛选参数）
const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  itemCount: 0,
  prefix: () => `共 ${total.value} 条`
});

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroupAccs({
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

async function handleSync() {
  const { error } = await syncGroupAcc();
  if (!error) {
    window.$message?.success('同步成功');
    fetchData();
  }
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.GroupAcc, key: keyof Api.Bills.GroupAcc) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 盈亏率渲染：保留两位小数并追加百分号
function renderRate(row: Api.Bills.GroupAcc, key: keyof Api.Bills.GroupAcc) {
  const val = row[key];
  return val != null ? `${Number(val).toFixed(2)}%` : '-';
}

const columns = [
  { title: '账户', key: 'account', width: 120 },
  { title: '资金余额', key: 'cash_acc', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'cash_acc') },
  { title: '账户浮盈', key: 'fm_acc', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'fm_acc') },
  { title: '总成本', key: 'cost_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'cost_total') },
  { title: '总市值', key: 'value_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'value_total') },
  { title: '账户资产', key: 'acc_aset', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'acc_aset') },
  { title: '总浮盈', key: 'pf_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'pf_total') },
  { title: '总盈亏', key: 'pl_all', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'pl_all') },
  { title: '总盈亏率', key: 'pfl_all', width: 100, render: (row: Api.Bills.GroupAcc) => renderRate(row, 'pfl_all') },
  { title: '日盈亏率', key: 'pfl_day', width: 100, render: (row: Api.Bills.GroupAcc) => renderRate(row, 'pfl_day') }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper">
      <NSpace class="mb-16px">
        <NButton type="primary" :loading="loading" @click="handleSync">
          <template #icon>
            <SvgIcon icon="mdi:sync" />
          </template>
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
