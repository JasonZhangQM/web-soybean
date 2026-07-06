<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchProfitYears } from '@/service/api';

defineOptions({ name: 'BillsProfitYearsPage' });

const loading = ref(false);
const tableData = ref<Api.Bills.ProfitYear[]>([]);
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

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchProfitYears({
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

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.ProfitYear, key: keyof Api.Bills.ProfitYear) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 列名按后端 ProfitYear 模型 comment 参数值设置
const columns = [
  { title: '年度', key: 'year', width: 100 },
  { title: '平仓盈亏l', key: 'pl_long', width: 120, render: (row: Api.Bills.ProfitYear) => renderAmount(row, 'pl_long') },
  { title: '平仓盈亏s', key: 'pl_short', width: 120, render: (row: Api.Bills.ProfitYear) => renderAmount(row, 'pl_short') },
  { title: '其他损益', key: 'pl_other', width: 120, render: (row: Api.Bills.ProfitYear) => renderAmount(row, 'pl_other') },
  { title: '平仓盈亏', key: 'pl_all', width: 120, render: (row: Api.Bills.ProfitYear) => renderAmount(row, 'pl_all') },
  { title: '累计盈亏', key: 'pl_cumulative', width: 120, render: (row: Api.Bills.ProfitYear) => renderAmount(row, 'pl_cumulative') }
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
