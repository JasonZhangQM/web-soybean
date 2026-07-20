<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchGoldReserves, syncGoldReserve, syncAllGoldReserves } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';

defineOptions({ name: 'GoldReservesPage' });

const bdsStore = useBdsStore();
const loading = ref(false);
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
// 全量同步 loading：与单国家同步分离，避免按钮间互相影响
const allSyncLoading = ref(false);
const tableData = ref<Api.Bds.GoldReserve[]>([]);
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

// 搜索参数：country_code 多选精确匹配，日期范围
const searchParams = reactive<{
  country_code?: string[] | null;
  dateRange?: [number, number] | null;
}>({});

// 国家下拉选项：computed 包装保证 store 异步加载后更新
const countryOptions = computed(() => bdsStore.getGoldReserveCountryOptions());

// 同步用单个国家代码（精确匹配）
const syncCountryCode = ref<string | null>(null);

// 数值格式化：保留 2 位小数，空值显示 --
// 后端 Decimal 字段经 Pydantic 序列化为字符串（如 "1234.5600"），需用 Number() 转换
function fmtNum(val: number | string | null): string {
  if (val === null || val === undefined) return '--';
  return Number(val).toFixed(2);
}

// 拉取黄金储备列表
async function fetchData() {
  loading.value = true;
  try {
    const [startTs, endTs] = searchParams.dateRange || [undefined, undefined];
    const { data, error } = await fetchGoldReserves({
      // 空数组传 undefined，避免向后端发送空数组
      country_code: searchParams.country_code?.length ? searchParams.country_code : undefined,
      start_date: startTs ? new Date(startTs).toISOString().slice(0, 10) : undefined,
      end_date: endTs ? new Date(endTs).toISOString().slice(0, 10) : undefined,
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

// 重置搜索条件并刷新（清空所有筛选并 page=1）
function handleReset() {
  searchParams.country_code = null;
  searchParams.dateRange = null;
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

// 触发后端同步单个国家黄金储备（按国家代码精确匹配）
async function handleSync() {
  if (!syncCountryCode.value) {
    window.$message?.warning('请选择要同步的国家');
    return;
  }
  const code = syncCountryCode.value;
  await executeSync(
    () => syncGoldReserve(code),
    syncLoading,
    fetchData
  );
}

// 触发全量同步所有国家黄金储备
async function handleAllSync() {
  await executeSync(
    () => syncAllGoldReserves(),
    allSyncLoading,
    fetchData
  );
}

// 列标题与后端 ORM comment 保持一致
const columns = [
  { title: '国家代码', key: 'country_code', width: 100, fixed: 'left' as const },
  { title: '国家名称', key: 'country_name', width: 120 },
  { title: '报告日期', key: 'rpt_date', width: 120 },
  { title: '黄金储备(USD)', key: 'gold_holdings_usd', width: 160, render: (row: Api.Bds.GoldReserve) => fmtNum(row.gold_holdings_usd) },
  { title: '单位', key: 'unit', width: 100 },
  { title: '频率', key: 'frequency', width: 80 },
  { title: '创建时间', key: 'create_time', width: 180 },
  { title: '更新时间', key: 'update_time', width: 180 }
];

onMounted(() => {
  fetchData();
  // 加载黄金储备国家列表，供筛选与同步下拉使用
  bdsStore.loadGoldReserveCountries();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选+同步表单：flex-wrap 允许窄屏自动换行，gap 控制项间距 -->
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
        <!-- 国家：NSelect 多选，选项从 bdsStore 动态拉取 -->
        <NFormItem label="国家">
          <NSelect
            v-model:value="searchParams.country_code"
            :options="countryOptions"
            multiple
            clearable
            filterable
            placeholder="选择国家"
            style="width: 220px"
          />
        </NFormItem>
        <!-- 日期范围：NDatePicker daterange，含今年/近一月/近一季等快速定位选项 -->
        <NFormItem label="日期范围">
          <NDatePicker
            v-model:value="searchParams.dateRange"
            type="daterange"
            clearable
            :shortcuts="dateRangeShortcuts"
            style="width: 280px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <!-- 同步区域：选择国家后点击同步按钮触发后端 IMF 数据源同步 -->
        <NFormItem label="同步国家">
          <NSpace>
            <NSelect
              v-model:value="syncCountryCode"
              :options="countryOptions"
              filterable
              clearable
              placeholder="选择国家"
              style="width: 200px"
            />
            <NButton type="primary" :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              同步
            </NButton>
          </NSpace>
        </NFormItem>
        <!-- 全量同步：20 国 ×30s 超时上限，单独设置 5 分钟超时 -->
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
        :scroll-x="1240"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
