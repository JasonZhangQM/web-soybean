<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchEconomicIndicators, syncEconomicIndicator } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';

defineOptions({ name: 'EconomicIndicatorsPage' });

const bdsStore = useBdsStore();
const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bds.EconomicIndicator[]>([]);
const total = ref(0);

// 分页配置（remote 模式）
const pagination = reactive({
  page: 1,
  pageSize: 20,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  itemCount: 0,
  prefix: () => `共 ${total.value} 条`
});

// 搜索参数：indicator_code 精确匹配，category 多选精确匹配
const searchParams = reactive<{
  indicator_code?: string | null;
  category?: string[] | null;
}>({});

// 日期范围（YYYY-MM-DD 格式字符串元组）
const dateRange = ref<[string, string] | null>(null);

// 类别下拉选项（固定列表）
const categoryOptions = [
  { label: '利率', value: '利率' },
  { label: '通胀', value: '通胀' },
  { label: '就业', value: '就业' },
  { label: '增长', value: '增长' },
  { label: '制造业', value: '制造业' },
  { label: '消费', value: '消费' },
  { label: '收益率', value: '收益率' }
];

// 同步用单个指标代码（精确匹配）
const syncIndicatorCode = ref<string | null>(null);

// 数值格式化：保留 2 位小数，空值显示 --
// 后端 Decimal 字段经 Pydantic 序列化为字符串（如 "4.2000"），需用 Number() 转换
function fmtNum(val: number | string | null): string {
  if (val === null || val === undefined) return '--';
  return Number(val).toFixed(2);
}

// 拉取经济指标列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchEconomicIndicators({
      indicator_code: searchParams.indicator_code || undefined,
      // category 为空数组时传 undefined，避免向后端发送空数组
      category: searchParams.category?.length ? searchParams.category : undefined,
      start_date: dateRange.value?.[0] || undefined,
      end_date: dateRange.value?.[1] || undefined,
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
  dateRange.value = null;
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

// 列标题与后端 ORM comment 保持一致
const columns = [
  { title: '指标代码', key: 'indicator_code', width: 180, fixed: 'left' as const },
  { title: '指标名称', key: 'indicator_name', width: 150 },
  { title: '类别', key: 'category', width: 80 },
  { title: '报告日期', key: 'report_date', width: 120 },
  { title: '发布日期', key: 'pub_date', width: 120 },
  { title: '数值', key: 'value', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value) },
  { title: '前值', key: 'value_prev', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value_prev) },
  { title: '预期值', key: 'value_expected', width: 100, render: (row: Api.Bds.EconomicIndicator) => fmtNum(row.value_expected) },
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
        <!-- 指标代码：NSelect 下拉选择，选项从 bdsStore 动态拉取 -->
        <NFormItem label="指标代码">
          <NSelect
            v-model:value="searchParams.indicator_code"
            :options="bdsStore.getIndicatorCodeOptions()"
            filterable
            clearable
            placeholder="选择指标"
            style="width: 200px"
          />
        </NFormItem>
        <!-- 类别：NSelect 多选 -->
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            multiple
            clearable
            placeholder="选择类别"
            style="width: 200px"
          />
        </NFormItem>
        <!-- 日期范围：包含今年/近一月/近一季/近一年/近三年/近五年/近十年快捷选项 -->
        <NFormItem label="日期范围">
          <NDatePicker
            v-model:formatted-value="dateRange"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 320px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <!-- 同步区域：选择指标后点击同步按钮触发后端同步 -->
        <NFormItem label="同步指标">
          <NSpace>
            <NSelect
              v-model:value="syncIndicatorCode"
              :options="bdsStore.getIndicatorCodeOptions()"
              filterable
              clearable
              placeholder="选择指标"
              style="width: 200px"
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
        :scroll-x="1200"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
