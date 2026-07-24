<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchDailyIndicators, syncDailyIndicator, syncAllDailyIndicators } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';

defineOptions({ name: 'UsDailyIndicatorsPage' });

const bdsStore = useBdsStore();
const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
// 全量同步 loading：与单指标同步分离，避免按钮间互相影响
const allSyncLoading = ref(false);
const tableData = ref<Api.Bds.DailyIndicator[]>([]);
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

// 搜索参数：indicator_code 单选精确匹配
const searchParams = reactive<{
  indicator_code?: string | null;
}>({});

// 指标代码下拉选项：computed 包装保证 store 异步加载后更新
const indicatorOptions = computed(() => bdsStore.getDailyIndicatorCodeOptions());

// 同步用单指标代码（精确匹配）
const syncIndicatorCode = ref<string | null>(null);

// 数值格式化：保留 4 位小数（收益率指标原始精度），空值显示 --
// 后端 Decimal 字段经 Pydantic 序列化为字符串（如 "4.2000"），需用 Number() 转换
function fmtNum(val: number | string | null): string {
  if (val === null || val === undefined) return '--';
  const num = Number(val);
  return Number.isFinite(num) ? num.toFixed(4) : '--';
}

// 拉取美债收益率指标分页列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchDailyIndicators({
      // 单选精确匹配：包装为单元素数组适配后端多选 IN 接口
      indicator_code: searchParams.indicator_code ? [searchParams.indicator_code] : undefined,
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
  pagination.page = 1;
  fetchData();
}

// 重置搜索条件并刷新
function handleReset() {
  searchParams.indicator_code = null;
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

// 触发后端同步单个美债收益率指标（按指标代码精确匹配，调用 FRED API）
async function handleSync() {
  if (!syncIndicatorCode.value) {
    window.$message?.warning('请选择要同步的指标');
    return;
  }
  const code = syncIndicatorCode.value;
  await executeSync(
    () => syncDailyIndicator(code),
    syncLoading,
    fetchData
  );
}

// 全量同步所有 4 个美债收益率指标
async function handleAllSync() {
  await executeSync(
    () => syncAllDailyIndicators(),
    allSyncLoading,
    fetchData
  );
}

// 列标题与后端 ORM comment 保持一致
const columns = [
  { title: '指标', key: 'indicator_short_name', width: 120, fixed: 'left' as const },
  { title: '类别', key: 'category', width: 80 },
  { title: '国别', key: 'country', width: 60 },
  { title: '报告日期', key: 'report_date', width: 110 },
  { title: '数值', key: 'value', width: 100, render: (row: Api.Bds.DailyIndicator) => fmtNum(row.value) },
  { title: '单位', key: 'unit', width: 60 },
  { title: '频率', key: 'frequency', width: 80 }
];

onMounted(() => {
  fetchData();
  // 加载美债收益率指标代码列表，供筛选与同步下拉使用
  bdsStore.loadDailyIndicatorCodes();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选+同步表单：flex-wrap 允许窄屏自动换行，gap 控制项间距 -->
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <!-- 指标代码：NSelect 单选精确匹配，选项从 bdsStore 动态拉取 -->
        <NFormItem label="指标">
          <NSelect
            v-model:value="searchParams.indicator_code"
            :options="indicatorOptions"
            filterable
            clearable
            placeholder="选择指标"
            style="width: 240px"
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
              placeholder="选择指标"
              style="width: 200px"
            />
            <NButton type="primary" :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步
            </NButton>
          </NSpace>
        </NFormItem>
        <!-- 全量同步：4 指标 ×15s 超时上限，后端已设 60s 超时 -->
        <NFormItem>
          <NButton type="primary" :loading="allSyncLoading" @click="handleAllSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            全量同步
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
        :scroll-x="780"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
