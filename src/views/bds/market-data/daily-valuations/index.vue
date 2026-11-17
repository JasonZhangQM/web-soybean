<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchDailyValuations } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'DailyValuationsPage' });

const loading = ref(false);
const tableData = ref<Api.Bds.DailyValuation[]>([]);
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

// 拉取估值指标列表（后端使用 limit/offset 分页）
async function fetchData() {
  loading.value = true;
  try {
    const [startDate, endDate] = searchParams.date_range || [];
    const { data, error } = await fetchDailyValuations({
      symbol: searchParams.symbol || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      // 后端使用 limit/offset 分页，offset 由 page 转换
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      // 无筛选时后端读计数表缓存（不数 643 万行全表）；缓存缺失/过旧会回落估算并标 ≈
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

// 数值格式化：估值比率/百分比，保留原值 2 位小数，null 显示 '-'（不除以1e8）
function fmtPct(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// 估值指标列配置：20 个数值字段统一 fmtPct 格式化，各自不同宽度
const valuationFieldConfigs: Array<{ key: keyof Api.Bds.DailyValuation; title: string; width?: number }> = [
  { key: 'pe_ttm', title: 'PE(TTM)', width: 80 },
  { key: 'pe_ttm_cut', title: 'PE(TTM)扣', width: 100 },
  { key: 'pb_lyr', title: 'PB(LYR)', width: 80 },
  { key: 'pb_mrq', title: 'PB(MRQ)', width: 80 },
  { key: 'pcf_ttm_oper', title: '市现(TTM)经', width: 100 },
  { key: 'pcf_ttm_ncf', title: '市现(TTM)净', width: 100 },
  { key: 'ps_ttm', title: 'PS(TTM)', width: 80 },
  { key: 'dy_ttm', title: 'DY(TTM)', width: 80 },
  { key: 'dy_lfy', title: 'DY(LFY)', width: 80 },
  { key: 'peg_lyr', title: 'PEG(LYR)', width: 80 },
  { key: 'pe_lyr', title: 'PE(LYR)', width: 80 },
  { key: 'pe_mrq', title: 'PE(MRQ)', width: 80 },
  { key: 'pe_lyr_cut', title: 'PE(LYR)扣', width: 80 },
  { key: 'pe_mrq_cut', title: 'PE(MRQ)扣', width: 90 },
  { key: 'pcf_lyr_oper', title: '市现(LYR)经', width: 100 },
  { key: 'pcf_lyr_ncf', title: '市现(LYR)净', width: 100 },
  { key: 'ps_lyr', title: 'PS(LYR)', width: 80 },
  { key: 'ps_mrq', title: 'PS(MRQ)', width: 80 },
  { key: 'peg_1q', title: 'PEG(1Q)', width: 80 },
  { key: 'peg_3q', title: 'PEG(3Q)', width: 80 }
];

// 由配置生成数值列：统一 fmtPct 格式化 + 右对齐，宽度从 cfg 读取（缺省 120）
function makeValuationColumn(cfg: { key: keyof Api.Bds.DailyValuation; title: string; width?: number }) {
  return {
    title: cfg.title,
    key: cfg.key,
    width: cfg.width ?? 120,
    align: 'right' as const,
    render: (row: Api.Bds.DailyValuation) => fmtPct(row[cfg.key])
  };
}

const columns = [
  { title: '股票代码', key: 'symbol', width: 120 },
  { title: '交易日期', key: 'trade_date', width: 100 },
  ...valuationFieldConfigs.map(makeValuationColumn)
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
