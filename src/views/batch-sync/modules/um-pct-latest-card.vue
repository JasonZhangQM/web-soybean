<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import {
  fetchSyncTasks,
  fetchSyncTask,
  fetchUmPctLatestStats,
  startUmPctLatestSync,
  stopBatchSync
} from '@/service/api';

defineOptions({ name: 'UmPctLatestCard' });

const message = useMessage();

/**
 * 最新估值分位截面表（irs_um_percentile，2026-11-05）
 *
 * 与上一张「按日落盘」卡片分工：
 * - 按日历史表是**存档**（一行 = 一标的一观察日，26,816 行，无页面消费）；
 * - 本表是**生产数据源**（一标的一行，≤8 行），供 `/today`、`/irs/underlying-monitors`、
 *   详情抽屉、证伪判定、档位纠偏读取。
 *
 * 范围**固定** = 标的监测表全部标的，无范围/模式选择；上游无估值数据的（SPX / GC00Y）
 * 由后端剔除。两表共用 `bds_sync_task` 全库一把锁，必须串行。
 */
const task = ref<Api.Bds.SyncTask | null>(null);
const stats = ref<Api.Irs.UmPctLatestStats | null>(null);
const starting = ref(false);
const stopping = ref(false);

const isRunning = computed(() => task.value?.status === 'running' || task.value?.status === 'pending');
const progressValue = computed(() => Number(task.value?.progress || 0));
const result = computed(() => (task.value?.result as Record<string, any> | null) ?? null);

const asOfText = computed(() => {
  const m = (result.value?.as_of_by_subject || {}) as Record<string, string | null>;
  const entries = Object.entries(m);
  return entries.length ? entries.map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ') : '';
});

const sourceText = computed(() => {
  const m = (result.value?.source_as_of || {}) as Record<string, string | null>;
  const entries = Object.entries(m);
  return entries.length ? entries.map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ') : '';
});

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
    if (task.value) void loadTask(task.value.id);
  }, 3000);
}

async function loadTask(id?: number) {
  try {
    if (id) {
      const { data, error } = await fetchSyncTask(id);
      if (!error && data && data.scope === 'um_pct_latest') {
        task.value = data;
        if (!isRunning.value) {
          stopPolling();
          await loadStats();
        }
      }
      return;
    }
    // 本卡片自己按 scope 认领最近一次任务（不能用 latest：别的卡片可能更新）
    const { data, error } = await fetchSyncTasks(20);
    if (!error && Array.isArray(data)) {
      const mine = data.find(item => item.scope === 'um_pct_latest');
      if (mine) {
        task.value = mine;
        if (isRunning.value) startPolling();
      }
    }
  } catch {
    // 404 / 网络异常忽略，不影响其它卡片
  }
}

async function loadStats() {
  try {
    const { data, error } = await fetchUmPctLatestStats();
    if (!error && data) stats.value = data;
  } catch {
    // 只读概览失败不阻断刷新操作
  }
}

async function handleStart() {
  starting.value = true;
  try {
    const { data, error } = await startUmPctLatestSync();
    if (error) {
      message.error(error.message || '启动失败（可能已有任务在跑）');
      return;
    }
    message.success(`已启动刷新任务 #${data.id}`);
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
  void loadTask();
  void loadStats();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <NCard size="small" class="bds-sync-card" style="margin-top: 16px">
    <template #header>最新估值分位（/today 与标的监测页的数据源）</template>
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
        一标的一行，只存最新分位，供
        <b>/today</b>
        、
        <b>/irs/underlying-monitors</b>
        （含详情抽屉、证伪判定、档位纠偏）读取；按日历史表仍在，作存档与审计。
        <br />
        范围
        <b>固定 = 标的监测表（不可选）</b>
        ，无估值数据的标的（如 SPX / GC00Y）自动剔除；监测表增删标的后重跑一次即同步，
        <b>已移除标的的行会被删除</b>
        （本表是监测表的镜像）。
        <br />
        ⚠️ 与批量同步共用全局任务锁：建议顺序「批量同步 → 成分增量 → 指数估值增量 →
        <b>最新分位</b>
        」；运行中其它任务会 409。
      </div>

      <NSpace align="center" :size="10" wrap>
        <NButton type="primary" :loading="starting" :disabled="isRunning" @click="handleStart">刷新最新截面</NButton>
        <NButton v-if="isRunning" :loading="stopping" @click="handleStop">停止</NButton>
        <span class="text-12px" style="color: #666">
          表内
          <b>{{ stats?.rows ?? 0 }}</b>
          行
          <template v-if="stats?.calc_at">· 最近刷新 {{ stats.calc_at }}</template>
          <template v-if="stats?.oldest_calc_at && stats.oldest_calc_at !== stats.calc_at">
            · 最老 {{ stats.oldest_calc_at }}
          </template>
        </span>
      </NSpace>

      <template v-if="task">
        <NProgress type="line" :percentage="progressValue" :height="10" />
        <div class="text-12px">
          进度 {{ task.done_count }} / {{ task.total_count }}（{{ task.progress }}%）
          <template v-if="task.errors?.length">· 失败 {{ task.errors.length }} 条</template>
        </div>
        <div v-if="result" class="text-12px" style="color: #666; line-height: 1.8">
          写入 {{ result.rows_upserted }} 行（新增 {{ result.rows_appeared }}）· 删除范围外 {{ result.rows_deleted }} ·
          耗时 {{ result.duration_ms }} ms · 计算时刻 {{ result.calc_at }}
          <br />
          <template v-if="sourceText">上游源末日：{{ sourceText }}</template>
          <template v-if="asOfText">
            <br />
            各标的锚点：{{ asOfText }}
          </template>
          <template v-if="result.excluded_no_data?.length">
            <br />
            无估值数据已剔除：{{ result.excluded_no_data.join('、') }}
          </template>
          <template v-if="Object.keys(result.stale_by_subject || {}).length">
            <br />
            ⚠️ 落后于源末日（停牌 / 上游缺行）：
            {{
              Object.entries(result.stale_by_subject)
                .map(([k, v]) => `${k} 落后 ${v} 天`)
                .join('、')
            }}
          </template>
        </div>
      </template>

      <div v-if="stats?.subjects?.length" class="text-12px" style="color: #666; line-height: 1.9">
        <div v-for="s in stats.subjects" :key="s.symbol">
          <span style="display: inline-block; width: 120px">{{ s.symbol }}</span>
          <span style="display: inline-block; width: 96px; color: #999">{{ s.as_of ?? '—' }}</span>
          <span style="display: inline-block; width: 120px">PE10y {{ s.pe_pct_10y ?? '—' }}</span>
          <span style="display: inline-block; width: 120px">PB10y {{ s.pb_pct_10y ?? '—' }}</span>
          <NTag v-if="s.status_pe !== 'ok' || s.status_pb !== 'ok'" size="tiny" type="warning">
            {{ s.status_pe }}/{{ s.status_pb }}
          </NTag>
        </div>
      </div>
    </NSpace>
  </NCard>
</template>
