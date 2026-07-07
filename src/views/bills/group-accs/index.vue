<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchGroupAccs, syncGroupAcc } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';

defineOptions({ name: 'BillsGroupAccsPage' });

const billsStore = useBillsStore();

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bills.GroupAcc[]>([]);
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

// 筛选参数：account 多选精确匹配，acc_aset_only 控制账户净值不为0
const searchParams = reactive<{ account?: string[]; acc_aset_only?: boolean }>({ acc_aset_only: true });

// 账户下拉选项（从全局 store 获取）
const accountOptions = computed(() => billsStore.getAccountOptions());

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroupAccs({
      ...searchParams,
      // 仅在选中"不为0"时传递该参数
      acc_aset_only: searchParams.acc_aset_only === true ? true : undefined,
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
  searchParams.acc_aset_only = undefined;
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
  await executeSync(syncGroupAcc, syncLoading, fetchData);
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.GroupAcc, key: keyof Api.Bills.GroupAcc) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

const columns = [
  { title: '账户', key: 'account', width: 120 },
  { title: '资金余额', key: 'cash_acc', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'cash_acc') },
  { title: '理财余额', key: 'fm_acc', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'fm_acc') },
  { title: '证券成本', key: 'cost_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'cost_total') },
  { title: '证券市值', key: 'value_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'value_total') },
  { title: '账户净值', key: 'acc_aset', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'acc_aset') },
  { title: '浮动盈亏', key: 'pf_total', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'pf_total') },
  { title: '平仓盈亏', key: 'pl_all', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'pl_all') },
  { title: '盈亏合计', key: 'pfl_all', width: 100, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'pfl_all') },
  { title: '融资余额', key: 'diff_br', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'diff_br') },
  { title: '出入净额', key: 'diff_dw', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'diff_dw') },
  { title: '划转净额', key: 'diff_dwt', width: 120, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'diff_dwt') },
  { title: '状态', key: 'status', width: 100, render: (row: Api.Bills.GroupAcc) => renderAmount(row, 'status') }
];

onMounted(() => {
  fetchData();
  // 确保账户列表已加载（全局 store 会自动去重）
  billsStore.loadAccounts();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left">
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
        <NFormItem label="账户净值">
          <NRadioGroup v-model:value="searchParams.acc_aset_only">
            <NRadio :value="undefined">全部</NRadio>
            <NRadio :value="true">不为0</NRadio>
          </NRadioGroup>
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
