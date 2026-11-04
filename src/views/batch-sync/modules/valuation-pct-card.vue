<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchSyncTasks, fetchSyncTask, startValuationPctSync, stopBatchSync } from '@/service/api';

defineOptions({ name: 'ValuationPctCard' });

const message = useMessage();

/**
 * 估值分位按日落盘（2026-11-04 P2）
 *
 * 与卡片 1/2/3 共用 bds_sync_task（全库一把锁），**必须最后跑**：
 * 批量同步 → 成分增量 → 指数估值增量 → 分位落盘。
 * 本卡片在组件内自行拉任务列表并按 scope 接管（同 MacroSyncCard 的做法），
 * 页面 onMounted 的 latest 分派只需把 valuation_pct 放进 NON_BATCH_SCOPES 即可。
 */
// 不能用 as const：NSelect 的 options 是可变数组，readonly 元组会报 TS4104
const MODE_OPTIONS: Array<{ label: string; value: 'M1' | 'M2' | 'M3' | 'auto' }> = [
  { label: 'M2 全量重建（推荐，兜底一切）', value: 'M2' },
  { label: 'M1 增量追加（只补新增交易日）', value: 'M1' },
  { label: 'M3 修订区间重算（需起始日）', value: 'M3' },
  { label: 'auto 按源序列指纹自动', value: 'auto' }
];

const mode = ref<'M1' | 'M2' | 'M3' | 'auto'>('M2');
const fromDate = ref<string | null>(null);
const starting = ref(false);
const stopping = ref(false);
const task = ref<Api.Bds.SyncTask | null>(null);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));
const result = computed(() => (task.value?.result as Api.Bds.ValuationPctResult | null) ?? null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (task.value) loadTask(task.value.id);
  }, 3000);
}

async function loadTask(id?: number) {
  try {
    if (id) {
      const { data, error } = await fetchSyncTask(id);
      if (!error && data && data.scope === 'valuation_pct') {
        task.value = data;
        if (!isRunning.value) stopPolling();
      }
      return;
    }
    // fetchLatestSyncTask 只给最新一条；本卡片改用任务列表找回自己最近一次任务，
    // 这样即使最新任务是别的卡片发起的，上次分位重算的结果仍然可见
    const { data, error } = await fetchSyncTasks(20);
    if (!error && Array.isArray(data)) {
      const mine = data.find(item => item.scope === 'valuation_pct');
      if (mine) {
        task.value = mine;
        if (isRunning.value) startPolling();
      }
    }
  } catch {
    // 404 / 网络异常忽略，不影响其它卡片
  }
}

async function handleStart() {
  if (mode.value === 'M3' && !fromDate.value) {
    message.warning('M3 需要填写修订起始日（YYYY-MM-DD）');
    return;
  }
  starting.value = true;
  try {
    const payload: Api.Bds.ValuationPctSyncRequest = { mode: mode.value };
    if (mode.value === 'M3') payload.from_date = fromDate.value;
    const { data, error } = await startValuationPctSync(payload);
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
    await loadTask(task.value.id);
  } finally {
    stopping.value = false;
  }
}

onMounted(() => {
  loadTask();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <NCard size="small" class="bds-sync-card" style="margin-top: 16px">
    <template #header>估值分位按日落盘（PE / PB / PS / 股息率 × 3 / 5 / 10 年）</template>
    <template #header-extra>
      <NTag
        v-if="task"
        :type="task.status === 'done' ? 'success' : task.status === 'failed' ? 'error' : 'warning'"
        size="small"
      >
        #{{ task.id }} {{ task.status }}
      </NTag>
    </template>

    <NSpace vertical :size="12">
      <div class="text-12px" style="color: #999; line-height: 1.7">
        一行 = 一个标的一个观察日（as_of）。窗口按
        <b>日历对日</b>
        回溯（如观察日 2025-10-23 的 10 年窗口左界 2015-10-23），
        锚点是各标的最后一个有值交易日；分位值恒定，时间推移只追加新行。
        <br />
        ⚠️ 与批量同步共用全局任务锁：请按「批量同步 → 成分增量 → 指数估值增量 →
        <b>本任务最后</b>
        」串行执行； 系统没有定时器，需每日手动点或外部定时调 HTTP。
      </div>

      <NSpace align="center" :size="10" wrap>
        <NSelect v-model:value="mode" :options="MODE_OPTIONS" :disabled="isRunning" style="width: 300px" />
        <NInput
          v-if="mode === 'M3'"
          v-model:value="fromDate"
          placeholder="修订起始日 YYYY-MM-DD"
          style="width: 200px"
        />
        <NButton type="primary" :loading="starting" :disabled="isRunning" @click="handleStart">启动重算</NButton>
        <NButton v-if="isRunning" :loading="stopping" @click="handleStop">停止</NButton>
      </NSpace>

      <template v-if="task">
        <NProgress type="line" :percentage="progressValue" :height="10" />
        <div class="text-12px">
          进度 {{ task.done_count }} / {{ task.total_count }}（{{ task.progress }}%）
          <template v-if="task.errors?.length">· 失败 {{ task.errors.length }} 条</template>
        </div>
        <template v-if="result">
          <div v-if="result.audit.changed > 0" class="text-12px" style="color: #d03050">
            ⚠️ 本次有 {{ result.audit.changed }} 行分位发生变化（最大 {{ result.audit.max_pct }} pct）
            ——上游历史修订或口径变更时会发生，请核对。
          </div>
          <div class="text-12px" style="color: #666; line-height: 1.8">
            模式 {{ result.mode }} · 窗口 {{ result.window_mode }} · 源末日 {{ result.source_as_of ?? '—' }} · 区间
            {{ result.as_of_range?.[0] ?? '—' }} ~ {{ result.as_of_range?.[1] ?? '—' }}
            <br />
            写入 {{ result.rows_upserted }} 行 · 变更 {{ result.audit.changed }} · 新增 {{ result.audit.appeared }} ·
            消失 {{ result.audit.vanished }} · 孤儿清理 {{ result.orphans_deleted }} · 耗时 {{ result.duration_ms }} ms
            <br />
            <template v-if="result.skipped_count > 0">
              {{ result.skipped_count }} 个标的输入指纹、源末日、窗口口径均未变，按分位恒定性跳过写入（非失败）
            </template>
            <template v-if="result.cut_stale_subjects?.length">
              ⚠️ {{ result.cut_stale_subjects.length }} 个标的窗口口径陈旧，已强制全量重建
            </template>
          </div>
        </template>
      </template>
    </NSpace>
  </NCard>
</template>
