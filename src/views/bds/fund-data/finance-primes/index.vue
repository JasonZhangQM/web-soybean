<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchFinancePrimes, syncFinancePrime } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'FinancePrimesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.FinancePrime[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：symbol 模糊匹配，rpt_type 报表类型，start_date 报告日期起始日
const searchParams = reactive<{
  symbol?: string | null;
  rpt_type?: number | null;
  start_date?: string | null;
}>({});

// rpt_type 下拉选项
const rptTypeOptions = [
  { label: '一季度报', value: 1 },
  { label: '中报', value: 6 },
  { label: '前三季报', value: 9 },
  { label: '年报', value: 12 }
];

// 代码远程搜索：筛选框与同步框各自独立的 composable 实例（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();
const { symbolOptions: syncSymbolOptions, symbolLoading: syncSymbolLoading, handleSymbolSearch: handleSyncSearch } = useSymbolSearch();

// 同步用单个股票代码（精确匹配）
const syncSymbol = ref<string | null>(null);

// 拉取财务主要指标列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchFinancePrimes({
      symbol: searchParams.symbol || undefined,
      // rpt_type 为 null 时传 undefined，避免向后端发送 null
      rpt_type: searchParams.rpt_type ?? undefined,
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
  searchParams.rpt_type = null;
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

// 触发后端同步财务主要指标（单个股票代码精确匹配）
async function handleSync() {
  if (!syncSymbol.value) {
    window.$message?.warning('请选择股票代码');
    return;
  }
  const symbol = syncSymbol.value;
  await executeSync(
    () => syncFinancePrime(symbol),
    syncLoading,
    fetchData
  );
}

// 数值格式化：绝对值（单位元）转亿元显示，保留 2 位小数，null 显示 '-'
function fmtYi(val: unknown) {
  return val != null ? (Number(val) / 1e8).toFixed(2) : '-';
}

// 数值格式化：比率/百分比原样显示，保留 2 位小数，null 显示 '-'
function fmtPct(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// rpt_type 格式化：数值映射为报表类型名称
function fmtRptType(val: number | null) {
  if (val == null) return '-';
  const map: Record<number, string> = { 1: '一季度报', 6: '中报', 9: '前三季报', 12: '年报' };
  return map[val] || String(val);
}

// 财务主要指标列配置：amt=绝对值类（元→亿元），pct=比率/百分比类（%），宽度 120
const primeFieldConfigs: Array<{ key: keyof Api.Bds.FinancePrime; title: string; kind: 'amt' | 'pct' }> = [
  { key: 'ttl_ast', title: '资产总计(亿元)', kind: 'amt' },
  { key: 'ttl_liab', title: '负债合计(亿元)', kind: 'amt' },
  { key: 'ttl_inc_oper', title: '营业总收入(亿元)', kind: 'amt' },
  { key: 'inc_oper', title: '营业收入(亿元)', kind: 'amt' },
  { key: 'oper_prof', title: '营业利润(亿元)', kind: 'amt' },
  { key: 'ttl_prof', title: '利润总额(亿元)', kind: 'amt' },
  { key: 'ttl_eqy_pcom', title: '归母股东权益合计(亿元)', kind: 'amt' },
  { key: 'net_prof_pcom', title: '归母净利润(亿元)', kind: 'amt' },
  { key: 'net_prof_pcom_cut', title: '扣非归母净利润(亿元)', kind: 'amt' },
  { key: 'roe', title: '净资产收益率ROE(摊薄,%)', kind: 'pct' },
  { key: 'roe_weight_avg', title: '净资产收益率ROE(加权,%)', kind: 'pct' },
  { key: 'roe_cut', title: '扣非净资产收益率ROE(摊薄,%)', kind: 'pct' },
  { key: 'roe_weight_avg_cut', title: '扣非净资产收益率ROE(加权,%)', kind: 'pct' },
  { key: 'net_cf_oper', title: '经营活动产生的现金流量净额(亿元)', kind: 'amt' },
  { key: 'inc_oper_yoy', title: '营业收入同比增长率(%)', kind: 'pct' },
  { key: 'ttl_inc_oper_yoy', title: '营业总收入同比增长率(%)', kind: 'pct' },
  { key: 'net_prof_pcom_yoy', title: '归属母公司股东的净利润同比增长率(%)', kind: 'pct' },
  { key: 'net_asset', title: '净资产(亿元)', kind: 'amt' },
  { key: 'net_prof', title: '净利润(亿元)', kind: 'amt' },
  { key: 'net_prof_cut', title: '扣非净利润(亿元)', kind: 'amt' }
];

// 由配置生成数值列：按 kind 选用 fmtYi / fmtPct，统一宽度
function makePrimeColumn(cfg: { key: keyof Api.Bds.FinancePrime; title: string; kind: 'amt' | 'pct' }) {
  const render = cfg.kind === 'amt' ? fmtYi : fmtPct;
  return {
    title: cfg.title,
    key: cfg.key,
    width: 120,
    render: (row: Api.Bds.FinancePrime) => render(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '报告日期', key: 'rpt_date', width: 120 },
  { title: '发布日期', key: 'pub_date', width: 120 },
  { title: '报表类型', key: 'rpt_type', width: 100, render: (row: Api.Bds.FinancePrime) => fmtRptType(row.rpt_type) },
  ...primeFieldConfigs.map(makePrimeColumn)
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
        <NFormItem label="报表类型">
          <NSelect
            v-model:value="searchParams.rpt_type"
            :options="rptTypeOptions"
            clearable
            placeholder="单选"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="报告起始日">
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
