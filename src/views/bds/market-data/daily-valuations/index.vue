<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchDailyValuations, syncDailyValuation } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useSymbolSearch } from '@/hooks/common/symbol-search';

defineOptions({ name: 'DailyValuationsPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.DailyValuation[]>([]);
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

// 拉取估值指标列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchDailyValuations({
      symbol: searchParams.symbol || undefined,
      start_date: searchParams.start_date || undefined,
      // 后端使用 limit/offset 分页，offset 由 page 转换
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

// 触发后端同步估值指标（单个股票代码精确匹配）
async function handleSync() {
  if (!syncSymbol.value) {
    window.$message?.warning('请选择股票代码');
    return;
  }
  const symbol = syncSymbol.value;
  await executeSync(
    () => syncDailyValuation(symbol),
    syncLoading,
    fetchData
  );
}

// 数值格式化：估值比率/百分比，保留原值 2 位小数，null 显示 '-'（不除以1e8）
function fmtPct(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// 估值指标列配置：20 个数值字段统一 fmtPct 格式化、宽度 120
const valuationFieldConfigs: Array<{ key: keyof Api.Bds.DailyValuation; title: string }> = [
  { key: 'pe_ttm', title: '市盈率(TTM)' },
  { key: 'pe_lyr', title: '市盈率(最新年报LYR)' },
  { key: 'pe_mrq', title: '市盈率(最新报告期MRQ)' },
  { key: 'pe_ttm_cut', title: '市盈率(TTM)扣除非经常性损益' },
  { key: 'pe_lyr_cut', title: '市盈率(最新年报LYR)扣除非经常性损益' },
  { key: 'pe_mrq_cut', title: '市盈率(最新报告期MRQ)扣除非经常性损益' },
  { key: 'pb_lyr', title: '市净率(最新年报LYR)' },
  { key: 'pb_mrq', title: '市净率(最新报告期MRQ)' },
  { key: 'pcf_ttm_oper', title: '市现率(经营现金流,TTM)' },
  { key: 'pcf_ttm_ncf', title: '市现率(现金净流量,TTM)' },
  { key: 'pcf_lyr_oper', title: '市现率(经营现金流,最新年报LYR)' },
  { key: 'pcf_lyr_ncf', title: '市现率(现金净流量,最新年报LYR)' },
  { key: 'ps_ttm', title: '市销率(TTM)' },
  { key: 'ps_lyr', title: '市销率(最新年报LYR)' },
  { key: 'ps_mrq', title: '市销率(最新报告期MRQ)' },
  { key: 'peg_lyr', title: '历史PEG值(当年年报增长率)' },
  { key: 'peg_1q', title: '历史PEG值(当年1季*4较上年年报增长率)' },
  { key: 'peg_3q', title: '历史PEG值(当年3季*4/3较上年年报增长率)' },
  { key: 'dy_ttm', title: '股息率(滚动12月TTM)' },
  { key: 'dy_lfy', title: '股息率(上一财年LFY)' }
];

// 由配置生成数值列：统一 render 与宽度
function makeValuationColumn(cfg: { key: keyof Api.Bds.DailyValuation; title: string }) {
  return {
    title: cfg.title,
    key: cfg.key,
    width: 120,
    render: (row: Api.Bds.DailyValuation) => fmtPct(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '交易日期', key: 'trade_date', width: 120 },
  ...valuationFieldConfigs.map(makeValuationColumn)
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选+同步表单：flex-wrap 允许窄屏自动换行，gap 控制项间距 -->
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
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
        :scroll-x="2800"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
