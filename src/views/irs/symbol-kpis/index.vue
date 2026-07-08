<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchSymbolKpis } from '@/service/api';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsSymbolKpisPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.SymbolKpi[]>([]);
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

const searchParams = reactive({ symbol: undefined as string | undefined });

// 拉取估值指标列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchSymbolKpis({
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

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');

const columns = [
  { title: '估值标的', key: 'symbol_value_id', width: 80 },
  { title: '昨收%', key: 'last_ratio', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.last_ratio) },
  { title: '年高%', key: 'max_ratio', width: 120, render: (row: Api.Irs.SymbolKpi) => fmt(row.max_ratio) },
  { title: '年低%', key: 'min_ratio', width: 120, render: (row: Api.Irs.SymbolKpi) => fmt(row.min_ratio) },
  { title: 'ROE(cut)', key: 'roe_cut', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.roe_cut) },
  { title: '营收yoy)', key: 'inc_oper_yoy', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.inc_oper_yoy) },
  { title: '净利yoy', key: 'net_prof_pcom_cut_yoy', width: 120, render: (row: Api.Irs.SymbolKpi) => fmt(row.net_prof_pcom_cut_yoy) },
  { title: '毛利率', key: 'sale_gpm', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.sale_gpm) },
  { title: 'PE(ttm)', key: 'pe_ttm_cut', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.pe_ttm_cut) },
  { title: 'PB(lyr)', key: 'pb_lyr', width: 80, render: (row: Api.Irs.SymbolKpi) => fmt(row.pb_lyr) },
  { title: 'DY(ttm)', key: 'dy_ttm', width: 100, render: (row: Api.Irs.SymbolKpi) => fmt(row.dy_ttm) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NInput v-model:value="searchParams.symbol" placeholder="请输入代码" clearable />
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
