<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchMonitorDiscounts, syncIrs } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsMonitorDiscountsPage' });

const loading = ref(false);
// 同步代码专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncCodeLoading = ref(false);
// 同步行情专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Irs.DiscountMonitor[]>([]);
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
  symbol: '' as string,
  symbol_con: '' as string,
  symbol_type: '' as string,
  is_main: null as number | null
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
    // is_main 用 1/0 映射 boolean，null 时不传；字符串字段 null 转为 undefined 避免传给后端
    const { is_main, symbol, symbol_con, symbol_type } = searchParams;
    const isMainBool = is_main === 1 ? true : is_main === 0 ? false : undefined;
    const { data, error } = await fetchMonitorDiscounts({
      symbol: symbol || undefined,
      symbol_con: symbol_con || undefined,
      symbol_type: symbol_type || undefined,
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
  // NInput 用空字符串清空最稳定；NSelect 用 null 清空
  searchParams.symbol = '';
  searchParams.symbol_con = '';
  searchParams.symbol_type = '';
  searchParams.is_main = null;
  pagination.page = 1;
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

// 触发同步代码（从 Config 读取连续合约 + gm SDK 更新合约信息）
async function handleSyncCode() {
  await executeSync(() => syncIrs('symbol-discount'), syncCodeLoading, fetchData);
}

// 触发同步行情（调用 discount_yield_em_orm 获取实时行情并计算贴水）
async function handleSync() {
  await executeSync(() => syncIrs('monitor-discount'), syncLoading, fetchData);
}

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');
// 日期截取前 10 位
const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : '-');

const columns = [
  { title: '真实合约', key: 'symbol', width: 120 },
  { title: '主力', key: 'is_main', width: 60, render: (row: Api.Irs.DiscountMonitor) => (row.is_main ? '是' : '否') },
  { title: '连续合约', key: 'symbol_con', width: 120 },
  { title: '合约类别', key: 'symbol_type', width: 80 },
  { title: '标的代码', key: 'symbol_ud', width: 100 },
  { title: '到期日', key: 'delisted_date', width: 120, render: (row: Api.Irs.DiscountMonitor) => fmtDate(row.delisted_date) },
  { title: '剩余天数', key: 'days_left', width: 80 },
  { title: '持仓量', key: 'position', width: 100 },
  { title: '合约现价', key: 'price', width: 100, render: (row: Api.Irs.DiscountMonitor) => fmt(row.price) },
  { title: '基础现价', key: 'price_ud', width: 100, render: (row: Api.Irs.DiscountMonitor) => fmt(row.price_ud) },
  { title: '贴水', key: 'discount', width: 100, render: (row: Api.Irs.DiscountMonitor) => fmt(row.discount) },
  { title: '贴水率(%)', key: 'ratio', width: 100, render: (row: Api.Irs.DiscountMonitor) => fmt(row.ratio) },
  { title: '贴水率(%Y)', key: 'ratio_y', width: 120, render: (row: Api.Irs.DiscountMonitor) => fmt(row.ratio_y) }
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
            <NButton type="primary" :loading="syncCodeLoading" @click="handleSyncCode">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步代码
            </NButton>
            <NButton type="primary" :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步行情
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
        :scroll-x="1500"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
