<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchEconomicIndicators, syncEconomicIndicator, syncEconomicIndicatorWscn } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';

defineOptions({ name: 'EconomicIndicatorsPage' });

const bdsStore = useBdsStore();
const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
// wscn 同步 loading
const wscnSyncLoading = ref(false);
const tableData = ref<Api.Bds.EconomicIndicator[]>([]);
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

// 搜索参数：indicator_code/category/country 均为单值精确匹配
const searchParams = reactive<{
  indicator_code?: string | null;
  category?: string | null;
  country?: string | null;
}>({});

// 类别下拉选项：从 indicatorCodeList 动态提取去重（下拉框内容动态拉取）
const categoryOptions = computed(() => {
  const categories = bdsStore.indicatorCodeList.map(item => item.category);
  return [...new Set(categories)].sort().map(c => ({ label: c, value: c }));
});

// 国别下拉选项：从 indicatorCodeList 动态提取去重（下拉框内容动态拉取）
const countryOptions = computed(() => {
  const countries = bdsStore.indicatorCodeList.map(item => item.country);
  return [...new Set(countries)].map(c => ({ label: c, value: c }));
});

// 指标代码下拉选项：computed 包装保证 store 异步加载后下拉框响应式更新
const indicatorOptions = computed(() => bdsStore.getIndicatorCodeOptions());

// 同步用单个指标代码（精确匹配）
const syncIndicatorCode = ref<string | null>(null);

// 数值格式化：保留 2 位小数，空值显示 --
// 后端 Decimal 字段经 Pydantic 序列化为字符串（如 "4.2000"），需用 Number() 转换
function fmtNum(val: number | string | null): string {
  if (val === null || val === undefined) return '--';
  return Number(val).toFixed(2);
}

// 整数格式化：重要性等整数字段，空值显示 --
function fmtInt(val: number | null): string {
  if (val === null || val === undefined) return '--';
  return String(val);
}

// 拉取经济指标列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchEconomicIndicators({
      indicator_code: searchParams.indicator_code || undefined,
      category: searchParams.category || undefined,
      country: searchParams.country || undefined,
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
  searchParams.indicator_code = null;
  searchParams.category = null;
  searchParams.country = null;
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

// 触发后端同步单个经济指标（按指标代码精确匹配）
async function handleSync() {
  if (!syncIndicatorCode.value) {
    window.$message?.warning('请选择要同步的指标');
    return;
  }
  const code = syncIndicatorCode.value;
  await executeSync(
    () => syncEconomicIndicator(code),
    syncLoading,
    fetchData
  );
}

// 触发 wscn 日历数据源同步（补充 forecast/importance/revised/pub_date）
async function handleWscnSync() {
  await executeSync(
    () => syncEconomicIndicatorWscn(),
    wscnSyncLoading,
    fetchData
  );
}

// 列标题与后端 ORM comment 保持一致
const columns = [
  { title: '指标', key: 'indicator_short_name', width: 160, fixed: 'left' as const },
  { title: '类别', key: 'category', width: 120 },
  { title: '国别', key: 'country', width: 60 },
  { title: '报告日期', key: 'report_date', width: 100 },
  { title: '发布日期', key: 'pub_date', width: 100 },
  { title: '数值', key: 'value', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value) },
  { title: '前值', key: 'value_prev', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value_prev) },
  { title: '预期值', key: 'value_expected', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value_expected) },
  { title: '重要性', key: 'importance', width: 60, render: (row: Api.Bds.EconomicIndicator) => fmtInt(row.importance) },
  { title: '修正值', key: 'revised', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.revised) },
  { title: '标题', key: 'title', width: 200, ellipsis: { tooltip: true } },
  { title: '前瞻', key: 'foresight', width: 160, ellipsis: { tooltip: true } },
  { title: '单位', key: 'unit', width: 60 },
  { title: '频率', key: 'frequency', width: 80 }
];

onMounted(() => {
  fetchData();
  // 加载经济指标代码列表，供筛选与同步下拉使用
  bdsStore.loadIndicatorCodes();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选+同步表单：flex-wrap 允许窄屏自动换行，gap 控制项间距 -->
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <!-- 指标：NSelect filterable 本地搜索，选项从 bdsStore 动态拉取（显示简称） -->
        <NFormItem label="指标">
          <NSelect
            v-model:value="searchParams.indicator_code"
            :options="indicatorOptions"
            filterable
            clearable
            placeholder="输入指标名称搜索"
            style="width: 200px"
          />
        </NFormItem>
        <!-- 类别：NSelect 单选精确匹配，filterable 支持输入过滤 -->
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            filterable
            clearable
            placeholder="选择类别"
            style="width: 140px"
          />
        </NFormItem>
        <!-- 国别：NSelect 单选精确匹配，filterable 支持输入过滤 -->
        <NFormItem label="国别">
          <NSelect
            v-model:value="searchParams.country"
            :options="countryOptions"
            filterable
            clearable
            placeholder="选择国别"
            style="width: 140px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <!-- 同步区域：选择指标后点击同步按钮触发后端 FRED 同步 -->
        <NFormItem label="同步指标">
          <NSpace>
            <NSelect
              v-model:value="syncIndicatorCode"
              :options="indicatorOptions"
              filterable
              clearable
              placeholder="输入指标名称搜索"
              style="width: 200px"
            />
            <NButton type="primary" :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步
            </NButton>
          </NSpace>
        </NFormItem>
        <!-- wscn 同步：华尔街见闻日历数据源，补充 forecast/importance/revised/pub_date -->
        <NFormItem>
          <NButton type="primary" :loading="wscnSyncLoading" @click="handleWscnSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            wscn同步
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
        :scroll-x="1780"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
