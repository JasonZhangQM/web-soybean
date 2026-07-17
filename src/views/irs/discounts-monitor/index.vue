<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchMonitorDiscounts, fetchDiscountOptions, syncIrs } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'IrsDiscountsMonitorPage' });

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
  symbol_type: null as string | null,
  con_name: null as string | null,
  is_main: null as number | null
});

// 是否主力下拉选项（NSelect 不支持 boolean 值，用 1/0 代替）
const isMainOptions = [
  { label: '是', value: 1 },
  { label: '否', value: 0 }
];
// 合约类别下拉选项（从后端 Config 动态拉取）
const symbolTypeOptions = ref<{ label: string; value: string }[]>([]);
// 连续合约名称下拉选项（从后端 Config 动态拉取）
const conNameOptions = ref<{ label: string; value: string }[]>([]);

// 拉取贴水监测列表
async function fetchData() {
  loading.value = true;
  try {
    // is_main 用 1/0 映射 boolean，null 时不传
    const { is_main, symbol_type, con_name } = searchParams;
    const isMainBool = is_main === 1 ? true : is_main === 0 ? false : undefined;
    const { data, error } = await fetchMonitorDiscounts({
      symbol_type: symbol_type || undefined,
      con_name: con_name || undefined,
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

// 拉取下拉选项（合约类别 + 连续合约名称，从 Config 取数）
async function fetchOptions() {
  const { data, error } = await fetchDiscountOptions();
  if (!error && data) {
    symbolTypeOptions.value = data.symbol_types.map(s => ({ label: s, value: s }));
    conNameOptions.value = data.con_names.map(c => ({ label: c, value: c }));
  }
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  // NSelect 用 null 清空
  searchParams.symbol_type = null;
  searchParams.con_name = null;
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
  { title: '连续合约名称', key: 'con_name', width: 100 },
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

onMounted(() => {
  fetchOptions();
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="合约类别">
          <NSelect
            v-model:value="searchParams.symbol_type"
            :options="symbolTypeOptions"
            filterable
            clearable
            placeholder="请选择"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="连续合约名称">
          <NSelect
            v-model:value="searchParams.con_name"
            :options="conNameOptions"
            filterable
            clearable
            placeholder="请选择"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="是否主力">
          <NSelect
            v-model:value="searchParams.is_main"
            :options="isMainOptions"
            clearable
            placeholder="请选择"
            style="width: 100px"
          />
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
        :scroll-x="1600"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
