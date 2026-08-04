<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchOptionMonitors, fetchOptionUnderlyings, cleanOptionMonitor } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IrsOptionMonitorPage' });

const loading = ref(false);
const tableData = ref<Api.Irs.OptionMonitor[]>([]);

// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

const searchParams = reactive({
  underlying_symbol: null as string | null,
  option_type: null as string | null,
  symbol: '' as string,
  // 到期月：NDatePicker month 类型返回时间戳；同时作为筛选与同步行情的共用输入
  end_month: null as number | null
});

// 期权类型下拉选项（前端写死）
const optionTypeOptions = [
  { label: '认购', value: 'call' },
  { label: '认沽', value: 'put' }
];
// 标的代码下拉选项（从后端 Config 动态拉取）
const underlyingSymbolOptions = ref<{ label: string; value: string }[]>([]);

// 清理代码专用 loading
const cleanLoading = ref(false);

// 拉取期权监测合并列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionMonitors({
      underlying_symbol: searchParams.underlying_symbol || undefined,
      option_type: searchParams.option_type || undefined,
      symbol: searchParams.symbol || undefined,
      // end_month 时间戳转为 YYYYMM 字符串供后端按月范围筛选
      end_month: searchParams.end_month ? formatEndMonth(searchParams.end_month) : undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      pagination.itemCount = data.total;
    }
  } finally {
    loading.value = false;
  }
}

// 拉取下拉选项（标的代码，从 Config.OPTIONS_MARCH 取数）
async function fetchOptions() {
  const { data, error } = await fetchOptionUnderlyings();
  if (!error && data) {
    underlyingSymbolOptions.value = data.underlying_symbols;
  }
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.underlying_symbol = null;
  searchParams.option_type = null;
  searchParams.symbol = '';
  searchParams.end_month = null;
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

// 将时间戳格式化为 YYYYMM 字符串
function formatEndMonth(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

// 清理已到期期权数据（days_left <= 0）
async function handleClean() {
  await executeSync(cleanOptionMonitor, cleanLoading, fetchData);
}

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null) => (v != null ? Number(v).toFixed(2) : '-');
// 日期截取前 10 位
const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : '-');
// 期权类型显示中文
const fmtOptionType = (v: string) => (v === 'call' ? '认购' : v === 'put' ? '认沽' : v);

const columns = [
  { title: '标的代码', key: 'underlying_symbol', width: 120 },
  { title: '行权价', key: 'price_strike', width: 80, render: (row: Api.Irs.OptionMonitor) => fmt(row.price_strike) },
  { title: '剩余天数', key: 'days_left', width: 70 },
  { title: '期权代码', key: 'symbol', width: 120 },
  { title: '期权类型', key: 'option_type', width: 70, render: (row: Api.Irs.OptionMonitor) => fmtOptionType(row.option_type) },
  { title: '标的现价', key: 'price_ud', width: 100, render: (row: Api.Irs.OptionMonitor) => fmt(row.price_ud) },
  { title: '平值(%)', key: 'atm_i', width: 80, render: (row: Api.Irs.OptionMonitor) => fmt(row.atm_i) },
  { title: '期权现价', key: 'price', width: 100, render: (row: Api.Irs.OptionMonitor) => fmt(row.price) },
  { title: '时间价值', key: 'value_t', width: 100, render: (row: Api.Irs.OptionMonitor) => fmt(row.value_t) },
  { title: '时间(%)', key: 'ratio_t', width: 80, render: (row: Api.Irs.OptionMonitor) => fmt(row.ratio_t) },
  { title: '时间(%Y)', key: 'ratio_t_y', width: 90, render: (row: Api.Irs.OptionMonitor) => fmt(row.ratio_t_y) },
  { title: '内在价值', key: 'value_i', width: 100, render: (row: Api.Irs.OptionMonitor) => fmt(row.value_i) },
  { title: '内在(%)', key: 'ratio_i', width: 80, render: (row: Api.Irs.OptionMonitor) => fmt(row.ratio_i) },
  { title: '内在(%Y)', key: 'ratio_i_y', width: 90, render: (row: Api.Irs.OptionMonitor) => fmt(row.ratio_i_y) },
  { title: '到期日', key: 'delisted_date', width: 120, render: (row: Api.Irs.OptionMonitor) => fmtDate(row.delisted_date) },
  { title: '期权乘数', key: 'multiplier', width: 80 }
];

onMounted(() => {
  fetchOptions();
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="标的">
          <NSelect
            v-model:value="searchParams.underlying_symbol"
            :options="underlyingSymbolOptions"
            filterable
            clearable
            placeholder="请选择"
            style="width: 200px"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NDatePicker
            v-model:value="searchParams.end_month"
            type="month"
            clearable
            placeholder="请选择"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="期权类型">
          <NSelect
            v-model:value="searchParams.option_type"
            :options="optionTypeOptions"
            clearable
            placeholder="请选择"
            style="width: 120px"
          />
        </NFormItem>
        <NFormItem label="期权代码">
          <NInput
            v-model:value="searchParams.symbol"
            clearable
            placeholder="请输入代码"
            style="width: 160px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem>
          <NButton
            type="primary"
            :loading="cleanLoading"
            @click="handleClean"
          >
            <template #icon><SvgIcon icon="mdi:trash-can-outline" /></template>
            清理代码
          </NButton>
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
        :scroll-x="1800"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
