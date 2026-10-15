<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { NTag } from 'naive-ui';
import { fetchSymbolInfos, syncSymbolInfo } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBdsStore } from '@/store/modules/bds';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'SymbolInfosPage' });

const bdsStore = useBdsStore();
// 代码远程搜索（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();
// 行业下拉选项（来自全局 store 缓存，由后端 DISTINCT 去重提供）
const industryOptions = computed(() => bdsStore.getIndustryOptions());

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.SymbolInfo[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：symbol 远程搜索选中代码，industry 下拉精确匹配
const searchParams = reactive<{
  symbol?: string | null;
  industry?: string | null;
  excludeSyncedToday: boolean;
}>({
  excludeSyncedToday: false
});

// 拉取证券信息列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchSymbolInfos({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
      industry: searchParams.industry || undefined,
      // 未勾选时不传该参数，交给后端按默认 False 处理
      exclude_synced_today: searchParams.excludeSyncedToday || undefined,
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
  searchParams.industry = null;
  searchParams.excludeSyncedToday = false;
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

// 触发后端同步证券信息（executeSync 内置进度条/防重复/结果通知）
async function handleSync() {
  await executeSync(syncSymbolInfo, syncLoading, fetchData);
}

// 数值格式化：后端 Decimal 字段返回字符串，需 Number() 转换后保留 2 位小数
function fmtNum(val: unknown) {
  return val != null ? Number(val).toFixed(2) : '-';
}

// 服务器本地当日（YYYY-MM-DD）：与后端 sync_at 写入口径一致，用于高亮「今日已同步」
const todayStr = new Date().toLocaleDateString('sv-SE');

// 同步日期渲染：无值显示「-」；等于当日高亮为绿色标签，否则灰色标签
function renderSyncAt(val: string | null) {
  if (!val) return h('span', { style: 'color: var(--n-text-color-3, #999)' }, '-');
  const isToday = val === todayStr;
  return h(NTag, { type: isToday ? 'success' : 'default', size: 'small', bordered: false }, { default: () => val });
}

const columns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '名称', key: 'name', width: 120 },
  { title: '所属行业', key: 'industry', width: 120 },
  { title: '上市日期', key: 'online_date', width: 100 },
  { title: '最新价', key: 'price', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.price) },
  { title: '涨幅%', key: 'rate', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.rate) },
  { title: 'PE(TTM)', key: 'pe_ttm', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.pe_ttm) },
  { title: 'PB', key: 'pb', width: 80, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.pb) },
  { title: '股息(TTM%)', key: 'dy_ttm', width: 100, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.dy_ttm) },
  { title: 'ROE(%)', key: 'roe', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.roe) },
  { title: '总收入(%)', key: 'yoy_in', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.yoy_in) },
  { title: '净利润(%)', key: 'yoy_np', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.yoy_np) },
  { title: '毛利率(%)', key: 'gpm', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.gpm) },
  { title: '负债率(%)', key: 'dar', width: 90, render: (row: Api.Bds.SymbolInfo) => fmtNum(row.dar) },
  { title: '报告期', key: 'latest_rpt_date', width: 100 },
  { title: '同步日期', key: 'sync_at', width: 100, render: (row: Api.Bds.SymbolInfo) => renderSyncAt(row.sync_at) }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
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
          />
        </NFormItem>
        <NFormItem label="行业">
          <NSelect
            v-model:value="searchParams.industry"
            :options="industryOptions"
            filterable
            clearable
            placeholder="行业精确匹配"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="">
          <NCheckbox v-model:checked="searchParams.excludeSyncedToday">今日未同步</NCheckbox>
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton type="primary" :loading="syncLoading" @click="handleSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            导入
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
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
