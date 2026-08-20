<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchDailyMktvalues, syncDailyMktvalue } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'DailyMktvaluesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.DailyMktvalue[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：symbol 模糊匹配，start_date 交易日期起始日
const searchParams = reactive<{
  symbol?: string | null;
  start_date?: string | null;
}>({});

// 代码远程搜索：筛选框与同步框各自独立的 composable 实例（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();
const { symbolOptions: syncSymbolOptions, symbolLoading: syncSymbolLoading, handleSymbolSearch: handleSyncSearch } = useSymbolSearch();

// 同步用单个股票代码（精确匹配）
const syncSymbol = ref<string | null>(null);

// 拉取每日市值列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchDailyMktvalues({
      symbol: searchParams.symbol || undefined,
      start_date: searchParams.start_date || undefined,
      // 后端使用 limit/offset 分页，offset 由 page 转换
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

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

// 重置搜索条件并刷新
function handleReset() {
  searchParams.symbol = null;
  searchParams.start_date = null;
  clearSymbolOptions();
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

// 触发后端同步每日市值（单个股票代码精确匹配）
async function handleSync() {
  if (!syncSymbol.value) {
    window.$message?.warning('请选择股票代码');
    return;
  }
  const symbol = syncSymbol.value;
  await executeSync(
    () => syncDailyMktvalue(symbol),
    syncLoading,
    fetchData
  );
}

// 数值格式化：市值/价值（单位元）转亿元显示，保留 2 位小数，null 显示 '-'
function fmtYi(val: unknown) {
  return val != null ? (Number(val) / 1e8).toFixed(2) : '-';
}

// 数值格式化：比率（倍）原样显示，保留 2 位小数，null 显示 '-'
function fmtRatio(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// 每日市值列配置：mv=市值/价值类（元→亿元），ratio=比率类（倍，不换算），宽度 120
const mktvalueFieldConfigs: Array<{ key: keyof Api.Bds.DailyMktvalue; title: string; kind: 'mv' | 'ratio' }> = [
  { key: 'tot_mv', title: '总市值(亿元)', kind: 'mv' },
  { key: 'tot_mv_csrc', title: '总市值(证监会算法,亿元)', kind: 'mv' },
  { key: 'a_mv', title: 'A股市值(亿元)', kind: 'mv' },
  { key: 'a_mv_ex_ltd', title: 'A股市值(剔除限售股,亿元)', kind: 'mv' },
  { key: 'b_mv', title: 'B股市值(亿元)', kind: 'mv' },
  { key: 'b_mv_ex_ltd', title: 'B股市值(剔除限售股,亿元)', kind: 'mv' },
  { key: 'ev', title: '企业价值(亿元)', kind: 'mv' },
  { key: 'ev_ex_curr', title: '企业价值(剔除货币资金,亿元)', kind: 'mv' },
  { key: 'ev_ebitda', title: '企业价值/EBITDA(倍)', kind: 'ratio' },
  { key: 'equity_value', title: '股权价值(亿元)', kind: 'mv' }
];

// 由配置生成数值列：按 kind 选用 fmtYi / fmtRatio，统一宽度
function makeMktvalueColumn(cfg: { key: keyof Api.Bds.DailyMktvalue; title: string; kind: 'mv' | 'ratio' }) {
  const render = cfg.kind === 'mv' ? fmtYi : fmtRatio;
  return {
    title: cfg.title,
    key: cfg.key,
    width: 120,
    render: (row: Api.Bds.DailyMktvalue) => render(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '交易日期', key: 'trade_date', width: 120 },
  ...mktvalueFieldConfigs.map(makeMktvalueColumn)
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选+同步表单：flex-wrap 允许窄屏自动换行，gap 控制项间距 -->
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="股票代码">
          <NSelect
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :loading="symbolLoading"
            filterable
            remote
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 200px"
            @search="handleSymbolSearch"
          />
        </NFormItem>
        <NFormItem label="交易起始日">
          <NDatePicker
            v-model:formatted-value="searchParams.start_date"
            type="date"
            value-format="yyyy-MM-dd"
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
            <NSelect
              v-model:value="syncSymbol"
              :options="syncSymbolOptions"
              :loading="syncSymbolLoading"
              filterable
              remote
              clearable
              placeholder="输入代码或名称搜索"
              style="width: 200px"
              @search="handleSyncSearch"
            />
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
