<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { syncAllDailyIndicators, syncAllGoldReserves, syncEconomicIndicatorWscn } from '@/service/api';
import { useBdsStore } from '@/store/modules/bds';

defineOptions({ name: 'MacroSyncCard' });

const message = useMessage();
const bdsStore = useBdsStore();

// ===================== 类型 =====================

/** 三个同步域：经济指标(wscn) / 美债收益率(FRED) / 黄金储备(IMF) */
type Domain = 'wscn' | 'daily' | 'gold';

/** 条目结果状态（对齐后端 count 语义：-1 失败 / 0 无数据 / >0 成功） */
type ItemStatus = 'success' | 'no_data' | 'error';

/**
 * 后端宏观同步端点实际返回 `count`（wscn 单值）或 `steps: {code: count}`（美债 / 黄金逐项），
 * 但 `Api.Bds.SyncResult` 未建模这两个字段；而 `utils/sync-feedback.ts` 中 SyncResultData.steps
 * 是 bills 的数组形状 —— 给 SyncResult 补字段会破坏三个宏观页 executeSync 的类型约束。
 * 故只在调用边界按真实形状读取，不改公共类型。
 */
interface MacroSyncPayload {
  status?: string;
  message?: string;
  count?: number;
  steps?: Record<string, number>;
}

interface ResultRow {
  key: string;
  code: string;
  name: string;
  statusText: string;
  count: number;
  note: string;
}

interface DomainState {
  running: boolean;
  cancelled: boolean;
  finished: boolean;
  startedAt: number;
  elapsed: number;
  errorText: string;
  summary: string;
  rows: ResultRow[];
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  success: '成功',
  no_data: '无数据',
  error: '失败'
};

function createState(): DomainState {
  return {
    running: false,
    cancelled: false,
    finished: false,
    startedAt: 0,
    elapsed: 0,
    errorText: '',
    summary: '',
    rows: []
  };
}

// ===================== 状态 =====================

const states = reactive<Record<Domain, DomainState>>({
  wscn: createState(),
  daily: createState(),
  gold: createState()
});

/** 卡片内同一时刻只允许一段运行 */
const runningDomain = ref<Domain | null>(null);

const dailyCount = computed(() => bdsStore.dailyIndicatorCodeList.length);
const goldCount = computed(() => bdsStore.goldReserveCountryList.length);

const domainList = computed(() => [
  {
    key: 'wscn' as Domain,
    title: '1. 经济指标（华尔街见闻）',
    desc: '一次性同步后端 WSCN_INDICATOR_MAP 覆盖的全部美国指标（端点无参数）；增量续拉，首次或重建全量自 2015-01 起按月分批。前端超时 10 分钟。'
  },
  {
    key: 'daily' as Domain,
    title: '2. 美债收益率指标（FRED）',
    desc: `一次性同步全部${dailyCount.value ? ` ${dailyCount.value} 个` : ''}指标（逐项串行，单项失败不中断）。前端超时 60 秒。`
  },
  {
    key: 'gold' as Domain,
    title: '3. 黄金储备（IMF）',
    desc: `一次性同步全部${goldCount.value ? ` ${goldCount.value} 个` : ''}国家（逐项串行，单国失败不中断）。前端超时 5 分钟；若全部失败，通常是 IMF SDMX API 不可达，需在 server_fast/.env 配置 HTTPS_PROXY。`
  }
]);

const DOMAIN_LABEL: Record<Domain, string> = {
  wscn: '经济指标',
  daily: '美债收益率指标',
  gold: '黄金储备'
};

// ===================== 结果表 =====================

const resultColumns = [
  { title: '代码', key: 'code', width: 180 },
  { title: '名称', key: 'name', width: 220 },
  { title: '状态', key: 'statusText', width: 90 },
  {
    title: '条数',
    key: 'count',
    width: 80,
    render: (row: ResultRow) => (row.count < 0 ? '—' : String(row.count))
  },
  { title: '说明', key: 'note' }
];

function nameOfDaily(code: string) {
  const hit = bdsStore.dailyIndicatorCodeList.find(i => i.indicator_code === code);
  return hit ? hit.indicator_short_name || hit.indicator_name : '—';
}

function nameOfGold(code: string) {
  const hit = bdsStore.goldReserveCountryList.find(i => i.country_code === code);
  return hit ? hit.country_name : '—';
}

function statusOf(count: number | undefined): ItemStatus {
  if (typeof count !== 'number') return 'error';
  if (count < 0) return 'error';
  if (count === 0) return 'no_data';
  return 'success';
}

function buildRows(dom: Domain, payload: MacroSyncPayload): ResultRow[] {
  // wscn：单值 count，无逐项 ⇒ 一行汇总
  if (dom === 'wscn') {
    const count = typeof payload.count === 'number' ? payload.count : -1;
    return [
      {
        key: 'wscn',
        code: '—',
        name: '全部指标',
        statusText: STATUS_TEXT[statusOf(count)],
        count,
        note: payload.message || ''
      }
    ];
  }

  // 美债 / 黄金：逐项字典 ⇒ 一行一项。行数取自后端返回的 steps（而非本地配置），
  // 这样配置增删后表格能如实反映"后端实际跑了哪些"。
  return Object.entries(payload.steps || {}).map(([code, value]) => ({
    key: code,
    code,
    name: dom === 'daily' ? nameOfDaily(code) : nameOfGold(code),
    statusText: STATUS_TEXT[statusOf(value)],
    count: typeof value === 'number' ? value : -1,
    note: ''
  }));
}

function summarize(dom: Domain, payload: MacroSyncPayload, rows: ResultRow[]): string {
  if (dom === 'wscn') return payload.message || '同步完成';
  if (rows.length === 0) return '后端未返回任何条目结果，请查看服务端日志';
  const success = rows.filter(r => r.statusText === STATUS_TEXT.success).length;
  const noData = rows.filter(r => r.statusText === STATUS_TEXT.no_data).length;
  const error = rows.filter(r => r.statusText === STATUS_TEXT.error).length;
  const stat = `共 ${rows.length} 项：成功 ${success} · 无数据 ${noData} · 失败 ${error}`;
  return payload.message ? `${payload.message}；${stat}` : stat;
}

// ===================== 计时器 =====================

let timer: ReturnType<typeof setInterval> | null = null;

function elapsedSeconds(startedAt: number) {
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

function startTimer(dom: Domain) {
  stopTimer();
  timer = setInterval(() => {
    if (states[dom].running) states[dom].elapsed = elapsedSeconds(states[dom].startedAt);
  }, 1000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec} 秒`;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return seconds === 0 ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
}

// ===================== 执行 =====================

function extractError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const text = (error as { message?: unknown }).message;
    if (typeof text === 'string' && text) return text;
  }
  return '同步请求失败';
}

/**
 * 执行全量同步。
 *
 * 端点本身就是"一次请求跑完一轮"（逐项循环在后端内部），因此前端拿不到任何中间进度，
 * 只能显示"运行中 + 已耗时"；也无法真正中止服务端执行 —— 见 handleCancel() 注释。
 */
async function runFull(dom: Domain, call: () => Promise<{ data: unknown; error: unknown }>) {
  if (runningDomain.value) return;

  const st = states[dom];
  st.running = true;
  st.cancelled = false;
  st.finished = false;
  st.startedAt = Date.now();
  st.elapsed = 0;
  st.errorText = '';
  st.summary = '';
  st.rows = [];
  runningDomain.value = dom;
  startTimer(dom);

  try {
    const { data, error } = await call();
    if (st.cancelled) return;

    if (error) {
      st.errorText = extractError(error);
      st.summary = '同步请求失败';
      message.error(`${DOMAIN_LABEL[dom]}：${st.errorText}`);
      return;
    }

    const payload = (data || {}) as MacroSyncPayload;
    st.rows = buildRows(dom, payload);
    st.summary = summarize(dom, payload, st.rows);
    const failed = st.rows.filter(r => r.statusText === STATUS_TEXT.error).length;
    if (failed > 0) message.warning(`${DOMAIN_LABEL[dom]}：${st.summary}`);
    else message.success(`${DOMAIN_LABEL[dom]}：${st.summary}`);
  } catch (err) {
    if (st.cancelled) return;
    st.errorText = extractError(err);
    st.summary = '同步异常';
    message.error(`${DOMAIN_LABEL[dom]}：${st.errorText}`);
  } finally {
    if (!st.cancelled) {
      st.running = false;
      st.finished = true;
      st.elapsed = elapsedSeconds(st.startedAt);
      runningDomain.value = null;
      stopTimer();
    }
  }
}

/** 各域对应的全量同步调用 */
const CALLERS: Record<Domain, () => Promise<{ data: unknown; error: unknown }>> = {
  wscn: () => syncEconomicIndicatorWscn(),
  daily: () => syncAllDailyIndicators(),
  gold: () => syncAllGoldReserves()
};

function handleRun(dom: Domain) {
  runFull(dom, CALLERS[dom]);
}

/**
 * 取消等待（≠ 停止）。
 *
 * 全量端点是同步阻塞请求，前端只能"不再等待"：立即解禁界面并丢弃本次结果，
 * 但后端线程仍会把整轮同步跑完（客户端无法中止服务端的同步函数执行）。
 * 真正的停止需要后端异步化（任务号 + 停止信号），不在本卡片范围。
 */
function handleCancel() {
  const dom = runningDomain.value;
  if (!dom) return;
  const st = states[dom];
  st.cancelled = true;
  st.running = false;
  st.finished = true;
  st.elapsed = elapsedSeconds(st.startedAt);
  st.errorText = '';
  st.summary = '已取消等待：后端仍会继续执行，完成后请在对应数据页确认结果';
  runningDomain.value = null;
  stopTimer();
  message.info('已取消等待，后端仍在继续执行');
}

// ===================== 展示辅助 =====================

function isBlocked(dom: Domain) {
  return runningDomain.value !== null && runningDomain.value !== dom;
}

function statusTag(dom: Domain): { text: string; type: 'default' | 'info' | 'success' | 'error' | 'warning' } {
  const st = states[dom];
  if (st.running) return { text: '运行中', type: 'info' };
  if (st.cancelled) return { text: '已取消等待', type: 'warning' };
  if (st.errorText) return { text: '失败', type: 'error' };
  if (st.finished) return { text: '已完成', type: 'success' };
  return { text: '未运行', type: 'default' };
}

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<template>
  <NCard size="small" style="margin-top: 16px">
    <template #header>
      <NSpace align="center" :size="12">
        <span>宏观数据同步</span>
        <NButton v-if="runningDomain" type="warning" ghost size="small" @click="handleCancel">取消等待</NButton>
      </NSpace>
    </template>

    <NAlert type="info" :bordered="false" style="margin-bottom: 4px">
      本卡片不经任务队列：无任务号、无服务端进度、无法中途停止。点击「取消等待」只是前端不再等待，后端仍会跑完整轮同步。
    </NAlert>

    <div v-for="item in domainList" :key="item.key">
      <NDivider title-placement="left">{{ item.title }}</NDivider>

      <div class="macro-desc">{{ item.desc }}</div>

      <NSpace align="center" :size="12" style="margin-top: 8px">
        <NButton
          type="primary"
          size="small"
          :loading="states[item.key].running"
          :disabled="isBlocked(item.key)"
          @click="handleRun(item.key)"
        >
          全量同步
        </NButton>
        <NTag :type="statusTag(item.key).type" round size="small">{{ statusTag(item.key).text }}</NTag>
        <span v-if="states[item.key].elapsed > 0" class="macro-elapsed">
          耗时 {{ formatDuration(states[item.key].elapsed) }}
        </span>
      </NSpace>

      <div v-if="states[item.key].rows.length > 0" style="margin-top: 12px">
        <div class="macro-desc">同步结果（{{ states[item.key].rows.length }} 项）</div>
        <NDataTable
          :columns="resultColumns"
          :data="states[item.key].rows"
          :bordered="false"
          size="small"
          :max-height="260"
        />
      </div>

      <div
        v-if="states[item.key].summary"
        class="macro-summary"
        :class="{ 'macro-summary--error': states[item.key].errorText }"
      >
        {{ states[item.key].summary }}
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.macro-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}

.macro-elapsed {
  font-size: 13px;
  color: #666;
}

.macro-summary {
  margin-top: 8px;
  font-size: 13px;
  color: #18a058;
}

.macro-summary--error {
  color: #d03050;
}
</style>
