<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchDailyMktvalues } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'DailyMktvaluesPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.DailyMktvalue[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：symbol 模糊匹配，date_range 交易期间 [起, 止]（同指数估值页交易日期，闭区间）
const searchParams = reactive<{
  symbol?: string | null;
  date_range?: [string, string] | null;
}>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 代码远程搜索（NSelect remote，防抖 300ms）；数据更新统一走批量同步，本页无同步入口
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

// 拉取每日市值列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const [startDate, endDate] = searchParams.date_range || [];
    const { data, error } = await fetchDailyMktvalues({
      symbol: searchParams.symbol || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      // 后端使用 limit/offset 分页，offset 由 page 转换
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      // 无筛选时后端读计数表缓存（不数 689 万行全表）；缓存缺失/过旧会回落估算并标 ≈
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
  { title: '股票代码', key: 'symbol', width: 120, fixed: 'left' as const },
  { title: '交易日期', key: 'trade_date', width: 120, fixed: 'left' as const },
  ...mktvalueFieldConfigs.map(makeMktvalueColumn)
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
        <NFormItem label="交易期间">
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
        :loading="loading"
        remote
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
