<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchFinanceDerivs } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'FinanceDerivsPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.FinanceDeriv[]>([]);
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

// 拉取财务指标列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const [startDate, endDate] = searchParams.date_range || [];
    const { data, error } = await fetchFinanceDerivs({
      symbol: searchParams.symbol || undefined,
      // rpt_type 为 null 时传 undefined，避免向后端发送 null
      rpt_type: searchParams.rpt_type ?? undefined,
      // sec_type 为 null（清空）时传 undefined = 不过滤主体类型
      sec_type: searchParams.sec_type || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      // 后端使用 limit/offset 分页，offset 由 page 转换
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

// 重置搜索条件并刷新（页码必须回到 1，否则重置后停在第 N 页可能为空页）
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

// 数值格式化：百分比/比率/天数/次数，保留原值 2 位小数，null 显示 '-'（不除以1e8）
function fmtPct(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// rpt_type 格式化：数值映射为报表类型名称
function fmtRptType(val: number | null) {
  if (val == null) return '-';
  const map: Record<number, string> = { 1: '一季度报', 6: '中报', 9: '前三季报', 12: '年报' };
  return map[val] || String(val);
}

// 财务指标列配置：20 个数值字段统一 fmtPct 格式化、宽度 120
const derivFieldConfigs: Array<{ key: keyof Api.Bds.FinanceDeriv; title: string }> = [
  { key: 'roe', title: '净资产收益率ROE(摊薄)' },
  { key: 'roe_weight', title: '净资产收益率ROE(加权)' },
  { key: 'roe_avg', title: '净资产收益率ROE(平均)' },
  { key: 'roa', title: '总资产报酬率ROA' },
  { key: 'roic', title: '投入资本回报率ROIC' },
  { key: 'sale_gpm', title: '销售毛利率' },
  { key: 'sale_npm', title: '销售净利率' },
  { key: 'ebitda_toi', title: 'EBITDA/营业总收入' },
  { key: 'ebit_toi', title: '息税前利润/营业总收入' },
  { key: 'ast_liab_rate', title: '资产负债率' },
  { key: 'curr_rate', title: '流动比率' },
  { key: 'quick_rate', title: '速动比率' },
  { key: 'liab_eqy_rate', title: '产权比率' },
  { key: 'ttl_ast_turnover_rate', title: '总资产周转率' },
  { key: 'acct_rcv_turnover_days', title: '应收账款周转天数(含应收票据)' },
  { key: 'inv_turnover_days', title: '存货周转天数' },
  { key: 'net_prof_pcom_yoy', title: '归属母公司股东的净利润同比增长率' },
  { key: 'ttl_inc_oper_yoy', title: '营业总收入同比增长率' },
  { key: 'net_prof_yoy', title: '净利润同比增长率' },
  { key: 'ttl_asset_yoy', title: '总资产同比增长率' }
];

// 由配置生成数值列：统一 render 与宽度
function makeDerivColumn(cfg: { key: keyof Api.Bds.FinanceDeriv; title: string }) {
  return {
    title: cfg.title,
    key: cfg.key,
    width: 120,
    render: (row: Api.Bds.FinanceDeriv) => fmtPct(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '报告日期', key: 'rpt_date', width: 120 },
  { title: '发布日期', key: 'pub_date', width: 120 },
  { title: '报表类型', key: 'rpt_type', width: 100, render: (row: Api.Bds.FinanceDeriv) => fmtRptType(row.rpt_type) },
  ...derivFieldConfigs.map(makeDerivColumn)
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
        :scroll-x="2900"
        :loading="loading"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
