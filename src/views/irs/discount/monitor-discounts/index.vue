<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchMonitorDiscounts } from '@/service/api';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsMonitorDiscountsPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.MonitorDiscount[]>([]);
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
  symbol: undefined as string | undefined,
  symbol_con: undefined as string | undefined,
  symbol_type: undefined as string | undefined,
  is_main: undefined as number | undefined
});

// 是否主力下拉选项（NSelect 不支持 boolean 值，用 1/0 代替）
const isMainOptions = [
  { label: '是', value: 1 },
  { label: '否', value: 0 }
];

// 拉取贴水监测列表
async function fetchData() {
  loading.value = true;
  try {
    // is_main 用 1/0 映射 boolean，undefined 时不传
    const { is_main, ...rest } = searchParams;
    const isMainBool = is_main === 1 ? true : is_main === 0 ? false : undefined;
    const { data, error } = await fetchMonitorDiscounts({
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
// 日期截取前 10 位
const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : '-');

const columns = [
  { title: '真实合约', key: 'symbol', width: 120 },
  { title: '连续合约', key: 'symbol_con', width: 120 },
  { title: '合约类别', key: 'symbol_type', width: 80 },
  { title: '主力', key: 'is_main', width: 60, render: (row: Api.Irs.MonitorDiscount) => (row.is_main ? '是' : '否') },
  { title: '标的代码', key: 'symbol_ud', width: 100 },
  { title: '到期日', key: 'delisted_date', width: 120, render: (row: Api.Irs.MonitorDiscount) => fmtDate(row.delisted_date) },
  { title: '剩余天数', key: 'days_left', width: 80 },
  { title: '持仓量', key: 'position', width: 100 },
  { title: '合约现价', key: 'price', width: 100, render: (row: Api.Irs.MonitorDiscount) => fmt(row.price) },
  { title: '基础现价', key: 'price_ud', width: 100, render: (row: Api.Irs.MonitorDiscount) => fmt(row.price_ud) },
  { title: '贴水', key: 'discount', width: 100, render: (row: Api.Irs.MonitorDiscount) => fmt(row.discount) },
  { title: '贴水率(%)', key: 'ratio', width: 100, render: (row: Api.Irs.MonitorDiscount) => fmt(row.ratio) },
  { title: '贴水率(%Y)', key: 'ratio_y', width: 120, render: (row: Api.Irs.MonitorDiscount) => fmt(row.ratio_y) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="真实合约">
          <NInput v-model:value="searchParams.symbol" placeholder="请输入真实合约" clearable />
        </NFormItem>
        <NFormItem label="连续合约">
          <NInput v-model:value="searchParams.symbol_con" placeholder="请输入连续合约" clearable />
        </NFormItem>
        <NFormItem label="合约类别">
          <NInput v-model:value="searchParams.symbol_type" placeholder="请输入合约类别" clearable />
        </NFormItem>
        <NFormItem label="是否主力">
          <NSelect v-model:value="searchParams.is_main" :options="isMainOptions" placeholder="请选择" clearable />
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
