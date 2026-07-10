<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { fetchIndexConstituents, syncIndexConstituent } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBdsStore } from '@/store/modules/bds';
import { useSymbolSearch } from '@/hooks/common/symbol-search';

defineOptions({ name: 'IndexConstituentsPage' });

const bdsStore = useBdsStore();
// 指数代码下拉选项（来自全局 store 缓存，由后端 Config.INDEX_CODE 字典提供）
const indexCodeOptions = bdsStore.getIndexCodeOptions();
// 成分股代码远程搜索（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.IndexConstituent[]>([]);
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

// 搜索参数：index_code 多选精确匹配，symbol 远程搜索选中代码，trade_date 交易日期精确匹配
const queryForm = reactive<{
  index_code: string[];
  symbol: string | null;
  trade_date: string | null;
}>({
  index_code: [],
  symbol: null,
  trade_date: null
});

// 同步日期：可选，指定同步的交易日，为 null 时获取最新交易日数据
const syncDate = ref<string | null>(null);

// 拉取指数成分股列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchIndexConstituents({
      index_code: queryForm.index_code.length ? queryForm.index_code : undefined,
      symbol: queryForm.symbol || undefined,
      trade_date: queryForm.trade_date || undefined,
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
  trimSearchParams(queryForm);
  pagination.page = 1;
  fetchData();
}

// 重置搜索条件并刷新
function handleReset() {
  queryForm.index_code = [];
  queryForm.symbol = null;
  queryForm.trade_date = null;
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

// 触发后端同步指数成分股（可指定交易日，未指定则获取最新交易日数据）
async function handleSync() {
  await executeSync(() => syncIndexConstituent(syncDate.value || undefined), syncLoading, fetchData);
}

// 权重格式化：保留 4 位小数
function fmtWeight(val: unknown) {
  return val != null ? Number(val).toFixed(4) : '-';
}

const columns = [
  { title: '指数代码', key: 'index_code', width: 120 },
  { title: '指数名称', key: 'sec_name', width: 120 },
  { title: '成分股代码', key: 'symbol', width: 120 },
  { title: '权重', key: 'weight', width: 100, render: (row: Api.Bds.IndexConstituent) => fmtWeight(row.weight) },
  { title: '交易日期', key: 'trade_date', width: 120 }
];

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选表单：flex-wrap 允许窄屏自动换行，gap 控制项间距，避免拥挤 -->
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <NFormItem label="指数代码">
          <NSelect
            v-model:value="queryForm.index_code"
            :options="indexCodeOptions"
            multiple
            clearable
            placeholder="多选精确匹配"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem label="成分股代码">
          <NSelect
            v-model:value="queryForm.symbol"
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
        <NFormItem label="交易日期">
          <NDatePicker
            v-model:formatted-value="queryForm.trade_date"
            type="date"
            value-format="yyyy-MM-dd"
            clearable
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
            <NDatePicker
              v-model:formatted-value="syncDate"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              placeholder="同步日期(可选)"
              style="width: 150px"
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
