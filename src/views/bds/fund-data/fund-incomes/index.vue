<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchFundIncomes } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'FundIncomesPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.FundIncome[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：symbol 模糊匹配，rpt_type 报表类型，sec_type 主体类型（默认不筛选），
// date_range 报告期间 [起, 止]（同指数估值页交易日期，两端点闭区间）
const searchParams = reactive<{
  symbol?: string | null;
  rpt_type?: number | null;
  sec_type?: 'stock' | 'index' | null;
  date_range?: [string, string] | null;
}>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// rpt_type 下拉选项
const rptTypeOptions = [
  { label: '一季度报', value: 1 },
  { label: '中报', value: 6 },
  { label: '前三季报', value: 9 },
  { label: '年报', value: 12 }
];

// 主体类型下拉选项：默认不筛选；清空 = 不过滤（同时返回个股与指数聚合行）
const secTypeOptions = [
  { label: '个股', value: 'stock' },
  { label: '指数', value: 'index' }
];

// 代码远程搜索（NSelect remote，防抖 300ms）；数据更新统一走批量同步，本页无同步入口
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

// 拉取利润表列表
async function fetchData() {
  loading.value = true;
  try {
    const [startDate, endDate] = searchParams.date_range || [];
    const { data, error } = await fetchFundIncomes({
      symbol: searchParams.symbol || undefined,
      // rpt_type 为 null 时传 undefined，避免向后端发送 null
      rpt_type: searchParams.rpt_type ?? undefined,
      // sec_type 为 null（清空）时传 undefined = 不过滤主体类型
      sec_type: searchParams.sec_type || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      // 无筛选时后端读计数表缓存（不数 36 万行全表）；缓存缺失/过旧会回落估算并标 ≈
      setPaginationTotal(pagination, data.total, data.total_is_estimated);
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
  // 主体类型恢复默认不筛选
  searchParams.sec_type = null;
  searchParams.date_range = null;
  clearSymbolOptions();
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

// 数值科目配置：key 与 title 对齐 ORM comment，一行一条；默认 fmtNum，EPS 列用 fmtEps
const incomeFieldConfigs: Array<{ key: keyof Api.Bds.FundIncome; title: string; formatter?: (v: unknown) => string }> =
  [
    { key: 'ttl_inc_oper', title: '营业总收入' },
    { key: 'inc_oper', title: '营业收入' },
    { key: 'ttl_cost_oper', title: '营业总成本' },
    { key: 'cost_oper', title: '营业成本' },
    { key: 'exp_sell', title: '销售费用' },
    { key: 'exp_adm', title: '管理费用' },
    { key: 'exp_rd', title: '研发费用' },
    { key: 'exp_fin', title: '财务费用' },
    { key: 'inc_inv', title: '投资收益' },
    { key: 'inc_fv_chg', title: '公允价值变动' },
    { key: 'oper_prof', title: '营业利润' },
    { key: 'ttl_prof', title: '利润总额' },
    { key: 'inc_tax', title: '所得税费用' },
    { key: 'net_prof', title: '净利润' },
    { key: 'net_prof_pcom', title: '归母净利润' },
    { key: 'net_prof_pcom_cut', title: '扣非归母净利润' },
    { key: 'inc_noper', title: '营业外收入' },
    { key: 'exp_noper', title: '营业外支出' },
    { key: 'eps_base', title: '基本每股收益', formatter: fmtEps },
    { key: 'eps_dil', title: '稀释每股收益', formatter: fmtEps }
  ];

// 数值列工厂：统一宽度 110、右对齐、默认 fmtNum 渲染（与财务指标页 makeDerivColumn 同构）
function makeNumColumn(cfg: { key: keyof Api.Bds.FundIncome; title: string; formatter?: (v: unknown) => string }) {
  return {
    title: cfg.title,
    key: cfg.key,
    width: 110,
    align: 'right' as const,
    render: (row: Api.Bds.FundIncome) => (cfg.formatter ?? fmtNum)(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 110 },
  { title: '报告日期', key: 'rpt_date', width: 110 },
  { title: '发布日期', key: 'pub_date', width: 110 },
  { title: '报表类型', key: 'rpt_type', width: 110, render: (row: Api.Bds.FundIncome) => fmtRptType(row.rpt_type) },
  { title: '快照数', key: 'snap_cons_cnt', width: 60, align: 'right' as const },
  { title: '聚合数', key: 'agg_cons_cnt', width: 60, align: 'right' as const },
  ...incomeFieldConfigs.map(makeNumColumn)
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选表单：flex-wrap 允许窄屏自动换行，gap 控制项间距；同步统一走批量同步页 -->
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
            style="width: 260px"
            @search="handleSymbolSearch"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="报表类型">
          <NSelect
            v-model:value="searchParams.rpt_type"
            :options="rptTypeOptions"
            clearable
            placeholder="全部"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="主体类型">
          <NSelect
            v-model:value="searchParams.sec_type"
            :options="secTypeOptions"
            clearable
            placeholder="全部"
            style="width: 130px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="报告期间">
          <NDatePicker
            v-model:formatted-value="searchParams.date_range"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 250px"
            @update:formatted-value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :scroll-x="2760"
        :loading="loading"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
