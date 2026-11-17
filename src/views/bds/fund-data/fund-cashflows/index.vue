<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchFundCashflows } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'FundCashflowsPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.FundCashflow[]>([]);
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

// 拉取现金流量表列表
async function fetchData() {
  loading.value = true;
  try {
    const [startDate, endDate] = searchParams.date_range || [];
    const { data, error } = await fetchFundCashflows({
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
      // 无筛选时后端读计数表缓存（不数 35 万行全表）；缓存缺失/过旧会回落估算并标 ≈
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

// 数值格式化：后端 Decimal 字段返回字符串，单位为元，转换为亿元保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? (Number(val) / 1e8).toFixed(2) : '-';
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
  { title: '报表类型', key: 'rpt_type', width: 100, render: (row: Api.Bds.FundCashflow) => fmtRptType(row.rpt_type) },
  {
    title: '销售商品、提供劳务收到的现金',
    key: 'cash_rcv_sale',
    width: 150,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_rcv_sale)
  },
  {
    title: '经营活动现金流入小计',
    key: 'cf_in_oper',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cf_in_oper)
  },
  {
    title: '购买商品、接受劳务支付的现金',
    key: 'cash_pur_gds_svc',
    width: 150,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_pur_gds_svc)
  },
  {
    title: '支付给职工以及为职工支付的现金',
    key: 'cash_pay_emp',
    width: 150,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_pay_emp)
  },
  {
    title: '支付的各项税费',
    key: 'cash_pay_tax',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_pay_tax)
  },
  {
    title: '经营活动现金流出小计',
    key: 'cf_out_oper',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cf_out_oper)
  },
  {
    title: '经营活动产生的现金流量净额',
    key: 'net_cf_oper',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.net_cf_oper)
  },
  {
    title: '收回投资收到的现金',
    key: 'cash_rcv_sale_inv',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_rcv_sale_inv)
  },
  {
    title: '投资活动现金流入小计',
    key: 'cf_in_inv',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cf_in_inv)
  },
  {
    title: '购建固定资产、无形资产和其他长期资产支付的现金',
    key: 'pur_fix_intg_ast',
    width: 150,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.pur_fix_intg_ast)
  },
  {
    title: '投资活动产生的现金流量净额',
    key: 'net_cf_inv',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.net_cf_inv)
  },
  {
    title: '取得借款收到的现金',
    key: 'brw_rcv',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.brw_rcv)
  },
  {
    title: '筹资活动现金流入小计',
    key: 'cf_in_fin',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cf_in_fin)
  },
  {
    title: '偿还债务支付的现金',
    key: 'cash_rpay_brw',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_rpay_brw)
  },
  {
    title: '筹资活动产生的现金流量净额',
    key: 'net_cf_fin',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.net_cf_fin)
  },
  { title: '净利润', key: 'net_prof', width: 120, render: (row: Api.Bds.FundCashflow) => fmtNum(row.net_prof) },
  {
    title: '汇率变动对现金及现金等价物的影响',
    key: 'efct_er_chg_cash',
    width: 150,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.efct_er_chg_cash)
  },
  {
    title: '现金及现金等价物净增加额',
    key: 'net_incr_cash_eq',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.net_incr_cash_eq)
  },
  {
    title: '期初现金及现金等价物余额',
    key: 'cash_cash_eq_bgn',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_cash_eq_bgn)
  },
  {
    title: '期末现金及现金等价物余额',
    key: 'cash_cash_eq_end',
    width: 120,
    render: (row: Api.Bds.FundCashflow) => fmtNum(row.cash_cash_eq_end)
  }
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
        :scroll-x="3800"
        :loading="loading"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
