<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue';
import { useMessage } from 'naive-ui';
import {
  startBatchSync,
  fetchLatestSyncTask,
  fetchSyncTask,
  stopBatchSync,
  type BatchSyncRequest
} from '@/service/api';
import { useBdsStore } from '@/store/modules/bds';

defineOptions({ name: 'BatchSyncPage' });

const message = useMessage();
const bdsStore = useBdsStore();

// ===================== 参数表单 =====================

/** 可选同步表（与后端 TABLES 常量一致） */
const TABLE_OPTIONS = [
  { label: '资产负债表', value: 'fund-balance' },
  { label: '利润表', value: 'fund-income' },
  { label: '现金流量表', value: 'fund-cashflow' },
  { label: '财务指标', value: 'finance-deriv' },
  { label: '每日估值', value: 'daily-valuation' },
  { label: '每日市值', value: 'daily-mktvalue' }
];

const scopeOptions = [
  { label: '全市场', value: 'all' },
  { label: '指数成分股', value: 'index' },
  { label: '指定行业', value: 'industry' },
  { label: '手写清单', value: 'explicit' }
];

const form = reactive({
  scope: 'all',
  index_code: '',
  industry: '',
  symbols: '',
  tables: TABLE_OPTIONS.map(o => o.value),
  mark_synced: true,
  exclude_synced_today: false,
  max_symbols: 0
});

const indexCodeOptions = computed(() => bdsStore.getIndexCodeOptions());
const industryOptions = computed(() => bdsStore.getIndustryOptions());

const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

// 进度面板状态
const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));
const errorList = computed(() => task.value?.errors || []);

const scopeLabelMap: Record<string, string> = {
  all: '全市场',
  index: '指数成分股',
  industry: '指定行业',
  explicit: '手写清单'
};
const scopeExtraLabel = computed(() => {
  if (!task.value?.scope_params) return '';
  const p = task.value.scope_params as Record<string, unknown>;
  if (p.index_code) return `· ${p.index_code}`;
  if (p.industry) return `· ${p.industry}`;
  if (Array.isArray(p.symbols)) return `· ${p.symbols.length} 只`;
  return '';
});

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

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function handleStart() {
  // 参数校验
  if (form.scope === 'index' && !form.index_code) {
    message.warning('请选择指数代码');
    return;
  }
  if (form.scope === 'industry' && !form.industry) {
    message.warning('请选择行业');
    return;
  }
  if (form.scope === 'explicit' && !form.symbols.trim()) {
    message.warning('请输入股票代码清单');
    return;
  }
  if (form.tables.length === 0) {
    message.warning('请至少选择一张同步表');
    return;
  }

  starting.value = true;
  try {
    const payload: BatchSyncRequest = {
      scope: form.scope,
      tables: form.tables,
      mark_synced: form.mark_synced,
      exclude_synced_today: form.exclude_synced_today,
      max_symbols: form.max_symbols
    };
    if (form.scope === 'index') payload.index_code = form.index_code;
    if (form.scope === 'industry') payload.industry = form.industry;
    if (form.scope === 'explicit') {
      payload.symbols = form.symbols.split(/[\s,，]+/).filter(Boolean);
    }
    const { data, error } = await startBatchSync(payload);
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
    message.info(data?.message || '停止信号已发出');
  } finally {
    stopping.value = false;
    if (task.value) await loadTask(task.value.id);
  }
}

// ===================== 任务轮询 =====================

async function loadTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (!error && data) {
      // 无 id 时（打开页面）只接管批量同步任务：bds_sync_task 与指数成分股回填共用，
      // scope=index_backfill 的任务由 /bds/index-constituents 页面自行展示
      if (!id && data.scope === 'index_backfill') return;
      task.value = data;

      // 运行中用后端真实任务参数锁定 form 显示——防止任何意外重置或 v-if 切换
      if (isRunning.value) {
        const p = (data.scope_params || {}) as Record<string, unknown>;
        form.scope = data.scope as typeof form.scope;
        form.index_code = (p.index_code as string) || '';
        form.industry = (p.industry as string) || '';
        form.symbols = Array.isArray(p.symbols) ? (p.symbols as string[]).join(',') : '';
        if (Array.isArray(p.tables)) form.tables = p.tables as typeof form.tables;
        if (typeof p.mark_synced === 'boolean') form.mark_synced = p.mark_synced;
        if (typeof p.exclude_synced_today === 'boolean') form.exclude_synced_today = p.exclude_synced_today;
        if (typeof p.max_symbols === 'number') form.max_symbols = p.max_symbols;
      }

      if (!isRunning.value) stopPolling();
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

// ===================== 失败明细表格 =====================

const errorColumns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '表', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];

onMounted(async () => {
  await Promise.all([bdsStore.loadIndexCodes(true), bdsStore.loadIndustries(true)]);
  await loadTask();
  if (isRunning.value) startPolling();
});

onBeforeUnmount(() => stopPolling());
</script>

<template>
  <div class="p-16px">
    <NCard size="small">
      <template #header>
        <NSpace align="center" :size="12">
          <span>批量同步</span>
          <NButton type="primary" size="small" :loading="starting" :disabled="isRunning" @click="handleStart">
            启动
          </NButton>
          <NButton v-if="isRunning" type="error" ghost size="small" :loading="stopping" @click="handleStop">
            停止
          </NButton>
        </NSpace>
      </template>

      <NForm inline label-placement="left" :show-feedback="false" :disabled="isRunning">
        <!-- 第一行：同步范围 + 条件项（指数/行业/清单，三选一） -->
        <NFormItem label="同步范围" label-width="80px">
          <NSelect v-model:value="form.scope" :options="scopeOptions" style="width: 130px" />
        </NFormItem>
        <NFormItem v-if="form.scope === 'index'" label="指数代码" label-width="70px">
          <NSelect
            v-model:value="form.index_code"
            :options="indexCodeOptions"
            placeholder="选择指数"
            filterable
            style="width: 180px"
          />
        </NFormItem>
        <NFormItem v-if="form.scope === 'industry'" label="行业" label-width="56px">
          <NSelect
            v-model:value="form.industry"
            :options="industryOptions"
            placeholder="选择行业"
            filterable
            style="width: 180px"
          />
        </NFormItem>
        <NFormItem v-if="form.scope === 'explicit'" label="代码清单" label-width="70px">
          <NInput v-model:value="form.symbols" placeholder="空格或逗号分隔" style="width: 260px" />
        </NFormItem>
      </NForm>

      <!-- 同步表 checkbox -->
      <div style="margin-top: 8px; display: flex; align-items: center; gap: 16px">
        <span style="font-size: 13px; color: #666; flex-shrink: 0">同步表：</span>
        <NCheckboxGroup v-model:value="form.tables" :disabled="isRunning" style="flex: 1">
          <NSpace :size="12" :wrap="true">
            <NCheckbox v-for="opt in TABLE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
      </div>

      <!-- 可选参数：最多标的 + 标记同步 + 跳过已同步（单独一行） -->
      <NForm inline label-placement="left" :show-feedback="false" :disabled="isRunning" style="margin-top: 8px">
        <NFormItem label="最多标的" label-width="80px">
          <NInputNumber v-model:value="form.max_symbols" :min="0" placeholder="0=不限" style="width: 120px" />
        </NFormItem>
        <NFormItem label="标记同步" label-width="80px">
          <NSwitch v-model:value="form.mark_synced" />
          <span style="margin-left: 6px; font-size: 12px; color: #999">写 sync_at</span>
        </NFormItem>
        <NFormItem label="跳过已同步" label-width="100px">
          <NSwitch v-model:value="form.exclude_synced_today" />
          <span style="margin-left: 6px; font-size: 12px; color: #999">跳过当日已跑</span>
        </NFormItem>
      </NForm>

      <!-- 进度面板（v-if="task" 启动后动态加载，复用成分股页面结构） -->
      <div v-if="task" style="margin-top: 20px">
        <NSpace align="center">
          <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
          <span style="font-size: 13px; color: #666">
            任务 #{{ task.id }} · {{ scopeLabelMap[task.scope] || task.scope }}{{ scopeExtraLabel }}
          </span>
        </NSpace>
        <NProgress
          type="line"
          :percentage="progressValue"
          :show-indicator="true"
          :indicator-width="38"
          :status="task.status === 'failed' ? 'error' : task.status === 'done' ? 'success' : 'default'"
          style="margin-top: 12px"
        />
        <NGrid :cols="4" :x-gap="12" style="margin-top: 8px">
          <NGridItem>
            <NStatistic label="已完成 / 总数" :value="`${task.done_count} / ${task.total_count}`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="success" :value="task.success_count" value-style="color: #18a058" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="no_data" :value="task.no_data_count" value-style="color: #999" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="error" :value="task.error_count" value-style="color: #d03050" />
          </NGridItem>
        </NGrid>

        <!-- 失败明细：仅终态后折叠展示，运行中占视觉 -->
        <NCollapse v-if="!isRunning && errorList.length > 0" style="margin-top: 12px">
          <NCollapseItem :title="`失败明细（${errorList.length}）`" name="errors">
            <NDataTable :columns="errorColumns" :data="errorList" :bordered="false" size="small" :max-height="240" />
          </NCollapseItem>
        </NCollapse>
        <div v-else-if="!isRunning && task.status === 'done'" style="color: #18a058; font-size: 13px; margin-top: 12px">
          全部完成，无失败项
        </div>
      </div>
    </NCard>
  </div>
</template>
