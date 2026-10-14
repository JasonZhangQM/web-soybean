<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, h } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  fetchIndexConstituents,
  startIndexConstituentSync,
  fetchSyncTask,
  fetchLatestSyncTask,
  stopBatchSync,
  type IndexConstituentSyncRequest
} from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { dateShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IndexConstituentsPage' });

const dialog = useDialog();
const message = useMessage();
const bdsStore = useBdsStore();
// 指数代码下拉选项（查询用，来自全局 store 缓存，由后端 Config.INDEX_CODE 提供）
const indexCodeOptions = bdsStore.getIndexCodeOptions();
// 成分股代码远程搜索（NSelect remote，防抖 300ms）
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

const loading = ref(false);
const tableData = ref<Api.Bds.IndexConstituent[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 搜索参数：index_code 单选精确匹配，symbol 远程搜索选中代码，trade_date 交易日期精确匹配
const queryForm = reactive<{
  index_code: string | null;
  symbol: string | null;
  trade_date: string | null;
}>({
  index_code: null,
  symbol: null,
  trade_date: null
});

// ===================== 同步 / 回填 =====================

// 可同步的指数（gm 不支持数据源的如 SP500 不提供给前端，后端也会硬校验拦截）
const syncableIndexOptions = computed(() =>
  bdsStore.indexCodeList
    .filter(item => item.gm_supported !== false)
    .map(item => ({ label: item.sec_name, value: item.code }))
);
// 指数名称映射（确认弹窗展示用）
const indexNameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  bdsStore.indexCodeList.forEach(item => {
    map[item.code] = item.sec_name;
  });
  return map;
});

// 待同步的指数（多选，默认全选可用项）；起始日期留空 = 各指数从库内最新交易日期 +1 增量
const syncIndexCodes = ref<string[]>([]);
const syncStartDate = ref<string | null>(null);
const starting = ref(false);
const stopping = ref(false);

// 任务对象（复用批量同步的 bds_sync_task，scope=index_backfill 用于区分归属）
const task = ref<Api.Bds.SyncTask | null>(null);
const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));

const statusLabel = computed(() => {
  const map: Record<string, { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
    pending: { text: '等待中', type: 'default' },
    running: { text: '运行中', type: 'info' },
    done: { text: '已完成', type: 'success' },
    failed: { text: '失败', type: 'error' },
    stopped: { text: '已停止', type: 'warning' }
  };
  return map[task.value?.status || ''] || { text: '-', type: 'default' };
});

// 本次任务参数回显（来自 scope_params）
const taskIndexCodes = computed<string[]>(() => task.value?.scope_params?.index_codes || []);
const taskStartDate = computed<string | null>(() => task.value?.scope_params?.start_date || null);
const errorList = computed(() => task.value?.errors || []);

// 拉取指数成分股列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchIndexConstituents({
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      index_code: queryForm.index_code || undefined,
      symbol: queryForm.symbol || undefined,
      trade_date: queryForm.trade_date || undefined,
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
  trimSearchParams(queryForm);
  pagination.page = 1;
  fetchData();
}

// 重置搜索条件并刷新
function handleReset() {
  queryForm.index_code = null;
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

// ===================== 任务轮询 =====================

let pollTimer: ReturnType<typeof setInterval> | null = null;
// 任务结束后只刷一次表格，避免轮询期间重复请求
let refreshedTaskId: number | null = null;

async function loadTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (error || !data) return;
    // 带 id 查询一定是本页发起的任务；不带 id 时只接管 index_backfill，避免把批量同步的任务显示成本页任务
    if (!id && data.scope !== 'index_backfill') return;
    task.value = data;
    if (!isRunning.value) {
      stopPolling();
      // 结束后刷新一次列表，让新留存的快照立即可见
      if (refreshedTaskId !== data.id) {
        refreshedTaskId = data.id;
        fetchData();
      }
    }
  } catch {
    // 404（暂无任务）忽略
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (task.value) loadTask(task.value.id);
  }, 2000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===================== 启动 / 停止 =====================

// 启动前二次确认：历史回填是长任务（数十分钟），需要用户明确确认
function confirmStart(): Promise<boolean> {
  const names = syncIndexCodes.value.map(code => indexNameMap.value[code] || code);
  const startTip = syncStartDate.value
    ? `起始日期：${syncStartDate.value}（回填至今天）`
    : '起始日期：未指定（各指数从库内最新交易日期 +1 增量）';
  return new Promise(resolve => {
    dialog.warning({
      title: '确认启动指数成分股同步 / 回填',
      content: () =>
        h('div', { style: 'line-height: 1.9' }, [
          h('div', `指数（${names.length} 只）：${names.join('、')}`),
          h('div', startTip),
          h(
            'div',
            { style: 'color: #d03050; margin-top: 8px' },
            '⚠️ 历史回填需逐日调用行情接口，可能耗时数十分钟；期间请保持后端服务运行。'
          )
        ]),
      positiveText: '启动',
      negativeText: '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false)
    });
  });
}

async function handleSync() {
  if (syncIndexCodes.value.length === 0) {
    message.warning('请至少选择一个指数');
    return;
  }
  if (!(await confirmStart())) return;

  starting.value = true;
  try {
    const payload: IndexConstituentSyncRequest = { index_codes: [...syncIndexCodes.value] };
    if (syncStartDate.value) payload.start_date = syncStartDate.value;
    const { data, error } = await startIndexConstituentSync(payload);
    if (error) {
      message.error(error.message || '启动失败');
      return;
    }
    message.success(`已启动任务 #${data.id}`);
    await loadTask(data.id);
    startPolling();
  } finally {
    starting.value = false;
  }
}

async function handleStop() {
  if (!task.value) return;
  stopping.value = true;
  try {
    const { data, error } = await stopBatchSync(task.value.id);
    if (error) {
      message.error(error.message || '停止失败');
      return;
    }
    // 正常停止：返回 stopping，后续靠轮询拿到 stopped；僵尸任务：直接返回 stopped
    message.info(data?.message || '停止信号已发出');
  } finally {
    stopping.value = false;
    if (task.value) await loadTask(task.value.id);
  }
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

const errorColumns = [
  { title: '指数代码', key: 'symbol', width: 130 },
  { title: '数据', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];

onMounted(async () => {
  fetchData();
  // 强制刷新指数代码（确保拿到 gm_supported 字段），默认全选可用项
  await bdsStore.loadIndexCodes(true);
  syncIndexCodes.value = syncableIndexOptions.value.map(option => option.value);
  // 接管上次未完成的回填任务（若有）
  await loadTask();
  if (isRunning.value) startPolling();
});

onBeforeUnmount(() => stopPolling());
</script>

<template>
  <div class="p-16px">
    <!-- 同步 / 回填区 -->
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small" title="指数成分股同步 / 回填">
      <NSpace align="center" :wrap="true" :size="12">
        <NSelect
          v-model:value="syncIndexCodes"
          :options="syncableIndexOptions"
          :disabled="isRunning"
          multiple
          clearable
          max-tag-count="responsive"
          placeholder="选择要同步的指数（可多选）"
          style="min-width: 320px; max-width: 480px"
        />
        <NDatePicker
          v-model:formatted-value="syncStartDate"
          :disabled="isRunning"
          type="date"
          value-format="yyyy-MM-dd"
          :shortcuts="dateShortcuts"
          clearable
          placeholder="起始日期(可选，不填=增量)"
          style="width: 210px"
        />
        <NButton type="primary" :loading="starting" :disabled="isRunning" @click="handleSync">
          <template #icon><SvgIcon icon="mdi:sync" /></template>
          同步 / 回填
        </NButton>
        <NButton v-if="isRunning" type="error" ghost :loading="stopping" @click="handleStop">停止</NButton>
      </NSpace>
      <div style="margin-top: 8px; font-size: 12px; color: #999">
        仅在成分股名单发生变化的交易日留存快照（不存每日权重）；已存交易日自动跳过，中断后重跑可续补。
      </div>

      <!-- 进度面板 -->
      <div v-if="task" style="margin-top: 16px">
        <NSpace align="center">
          <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
          <span style="font-size: 13px; color: #666">
            任务 #{{ task.id }} · {{ taskIndexCodes.length }} 只指数 · 起始 {{ taskStartDate || '增量' }}
          </span>
        </NSpace>
        <NProgress
          type="line"
          :percentage="progressValue"
          :status="task.status === 'failed' ? 'error' : task.status === 'done' ? 'success' : 'default'"
          style="margin-top: 12px"
        />
        <NGrid :cols="4" :x-gap="12" style="margin-top: 8px">
          <NGridItem>
            <NStatistic label="已完成 / 总交易日" :value="`${task.done_count} / ${task.total_count}`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="留存快照(条)" :value="task.success_count" value-style="color: #18a058" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="无数据(天)" :value="task.no_data_count" value-style="color: #999" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="失败(天)" :value="task.error_count" value-style="color: #d03050" />
          </NGridItem>
        </NGrid>
        <NCollapse v-if="errorList.length > 0" style="margin-top: 8px">
          <NCollapseItem :title="`失败明细（${errorList.length}）`" name="errors">
            <NDataTable :columns="errorColumns" :data="errorList" :bordered="false" size="small" :max-height="240" />
          </NCollapseItem>
        </NCollapse>
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <!-- 筛选表单：flex-wrap 允许窄屏自动换行，gap 控制项间距，避免拥挤 -->
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="指数代码">
          <NSelect
            v-model:value="queryForm.index_code"
            :options="indexCodeOptions"
            clearable
            placeholder="单选精确匹配"
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
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
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
