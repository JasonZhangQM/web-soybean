<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue';
import { NTag, NButton, useMessage } from 'naive-ui';
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
const task = ref<Api.Bds.SyncTask | null>(null);
const stopping = ref(false);
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
    // 立即拉一次并开始轮询
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
    // 继续轮询直到状态变成 stopped / done / failed
  } finally {
    stopping.value = false;
  }
}

// ===================== 进度面板 =====================

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');

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

/** 进度百分比（数字） */
const progressValue = computed(() => Number(task.value?.progress || 0));

async function loadTask(id?: number) {
  try {
    const { data, error } = id ? await fetchSyncTask(id) : await fetchLatestSyncTask();
    if (!error && data) {
      task.value = data;
      if (!isRunning.value) {
        stopPolling();
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

onMounted(async () => {
  // 预加载下拉选项
  await Promise.all([bdsStore.loadIndexCodes(true), bdsStore.loadIndustries(true)]);
  // 拉取最新任务（可能有上次未完成的）
  await loadTask();
  if (isRunning.value) startPolling();
});

onBeforeUnmount(() => stopPolling());

// ===================== 失败明细表格 =====================

const errorColumns = [
  { title: '代码', key: 'symbol', width: 130 },
  { title: '表', key: 'table', width: 130 },
  { title: '错误信息', key: 'message' }
];
</script>

<template>
  <div class="batch-sync-page">
    <NGrid :cols="24" :x-gap="24">
      <!-- 左：参数表单 -->
      <NGridItem :span="10">
        <NCard title="同步参数" size="small">
          <NForm label-placement="left" label-width="100px">
            <NFormItem label="同步范围">
              <NSelect v-model:value="form.scope" :options="scopeOptions" />
            </NFormItem>

            <NFormItem v-if="form.scope === 'index'" label="指数代码">
              <NSelect v-model:value="form.index_code" :options="indexCodeOptions" placeholder="选择指数" filterable />
            </NFormItem>

            <NFormItem v-if="form.scope === 'industry'" label="行业">
              <NSelect v-model:value="form.industry" :options="industryOptions" placeholder="选择行业" filterable />
            </NFormItem>

            <NFormItem v-if="form.scope === 'explicit'" label="代码清单">
              <NInput
                v-model:value="form.symbols"
                type="textarea"
                placeholder="输入股票代码，空格或逗号分隔&#10;如：SHSE.600519 SZSE.000001"
                :autosize="{ minRows: 3 }"
              />
            </NFormItem>

            <NFormItem label="同步表">
              <NCheckboxGroup v-model:value="form.tables">
                <NSpace>
                  <NCheckbox v-for="opt in TABLE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </NCheckbox>
                </NSpace>
              </NCheckboxGroup>
            </NFormItem>

            <NFormItem label="最多标的">
              <NInputNumber v-model:value="form.max_symbols" :min="0" placeholder="0=不限" />
            </NFormItem>

            <NFormItem label="标记同步">
              <NSwitch v-model:value="form.mark_synced" />
              <span style="margin-left: 12px; font-size: 12px; color: #999">全部成功后写 sync_at，下次可跳过</span>
            </NFormItem>

            <NFormItem label="跳过已同步">
              <NSwitch v-model:value="form.exclude_synced_today" />
              <span style="margin-left: 12px; font-size: 12px; color: #999">跳过当日已同步标的</span>
            </NFormItem>

            <NFormItem>
              <NSpace>
                <NButton type="primary" :loading="starting" @click="handleStart">启动批量同步</NButton>
                <NButton v-if="isRunning" type="error" :loading="stopping" @click="handleStop">停止任务</NButton>
              </NSpace>
            </NFormItem>
          </NForm>
        </NCard>
      </NGridItem>

      <!-- 右：进度面板 -->
      <NGridItem :span="14">
        <NCard title="同步进度" size="small">
          <NEmpty v-if="!task" description="暂无同步任务，在左侧配置参数后点击启动" />

          <template v-else>
            <!-- 状态 + 进度条 -->
            <div style="margin-bottom: 16px">
              <NSpace align="center">
                <NTag :type="statusLabel.type" round>
                  {{ statusLabel.text }}
                </NTag>
                <span style="font-size: 13px; color: #666">任务 #{{ task.id }} · {{ task.scope }}</span>
                <NButton v-if="isRunning" size="small" type="error" :loading="stopping" @click="handleStop">
                  停止
                </NButton>
              </NSpace>
              <NProgress
                type="line"
                :percentage="progressValue"
                :show-indicator="true"
                :status="task.status === 'failed' ? 'error' : task.status === 'done' ? 'success' : 'default'"
                style="margin-top: 12px"
              />
            </div>

            <!-- 计数统计 -->
            <NGrid :cols="4" :x-gap="12" style="margin-bottom: 16px">
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

            <!-- 失败明细 -->
            <NCollapse v-if="task.errors && task.errors.length > 0">
              <NCollapseItem title="失败明细" name="errors">
                <NDataTable
                  :columns="errorColumns"
                  :data="task.errors"
                  :bordered="false"
                  size="small"
                  :max-height="300"
                />
              </NCollapseItem>
            </NCollapse>

            <div v-else-if="task.status === 'done'" style="color: #18a058; font-size: 13px">全部完成，无失败项</div>
          </template>
        </NCard>
      </NGridItem>
    </NGrid>
  </div>
</template>

<style scoped>
.batch-sync-page {
  padding: 16px;
}
</style>
