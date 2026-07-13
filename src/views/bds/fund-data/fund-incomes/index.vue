<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchFundIncomes, syncFundIncome } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useSymbolSearch } from '@/hooks/common/symbol-search';

defineOptions({ name: 'FundIncomesPage' });

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.FundIncome[]>([]);
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

// 拉取利润表列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchFundIncomes({
      symbol: searchParams.symbol || undefined,
      // rpt_type 为 null 时传 undefined，避免向后端发送 null
      rpt_type: searchParams.rpt_type ?? undefined,
      start_date: searchParams.start_date || undefined,
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

// 触发后端同步利润表（单个股票代码精确匹配）
async function handleSync() {
  if (!syncSymbol.value) {
    window.$message?.warning('请选择股票代码');
    return;
  }
  const symbol = syncSymbol.value;
  await executeSync(
    () => syncFundIncome(symbol),
    syncLoading,
    fetchData
  );
}

// 金额格式化：后端 Decimal 字段返回字符串，单位为元，转换为亿元保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? (Number(val) / 1e8).toFixed(2) : '-';
}

// 每股收益格式化：保留原值 4 位小数（不除以 1e8）
function fmtEps(val: unknown) {
  return val != null ? Number(val).toFixed(4) : '-';
}

// rpt_type 格式化：数值映射为报表类型名称
function fmtRptType(val: number | null) {
  if (val == null) return '-';
  const map: Record<number, string> = { 1: '一季度报', 6: '中报', 9: '前三季报', 12: '年报' };
  return map[val] || String(val);
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '报告日期', key: 'rpt_date', width: 120 },
  { title: '发布日期', key: 'pub_date', width: 120 },
  { title: '报表类型', key: 'rpt_type', width: 100, render: (row: Api.Bds.FundIncome) => fmtRptType(row.rpt_type) },
  { title: '营业总收入', key: 'ttl_inc_oper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.ttl_inc_oper) },
  { title: '营业收入', key: 'inc_oper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.inc_oper) },
  { title: '营业总成本', key: 'ttl_cost_oper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.ttl_cost_oper) },
  { title: '营业成本', key: 'cost_oper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.cost_oper) },
  { title: '销售费用', key: 'exp_sell', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.exp_sell) },
  { title: '管理费用', key: 'exp_adm', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.exp_adm) },
  { title: '研发费用', key: 'exp_rd', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.exp_rd) },
  { title: '财务费用', key: 'exp_fin', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.exp_fin) },
  { title: '投资收益', key: 'inc_inv', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.inc_inv) },
  { title: '公允价值变动', key: 'inc_fv_chg', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.inc_fv_chg) },
  { title: '营业利润', key: 'oper_prof', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.oper_prof) },
  { title: '利润总额', key: 'ttl_prof', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.ttl_prof) },
  { title: '所得税费用', key: 'inc_tax', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.inc_tax) },
  { title: '净利润', key: 'net_prof', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.net_prof) },
  { title: '归母净利润', key: 'net_prof_pcom', width: 150, render: (row: Api.Bds.FundIncome) => fmtNum(row.net_prof_pcom) },
  { title: '营业外收入', key: 'inc_noper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.inc_noper) },
  { title: '营业外支出', key: 'exp_noper', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.exp_noper) },
  { title: '综合收益总额', key: 'ttl_comp_inc', width: 120, render: (row: Api.Bds.FundIncome) => fmtNum(row.ttl_comp_inc) },
  { title: '基本每股收益', key: 'eps_base', width: 120, render: (row: Api.Bds.FundIncome) => fmtEps(row.eps_base) },
  { title: '稀释每股收益', key: 'eps_dil', width: 120, render: (row: Api.Bds.FundIncome) => fmtEps(row.eps_dil) }
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
        :scroll-x="3000"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
