<script setup lang="ts">
/**
 * 今日待办（GET /irs/today）
 *
 * 把「8 个标的 × 5 个 Tab」摊开的「该干什么」压成一张按优先级排序的清单。
 * 所有口径（zone / 命中 / 裸仓 / 漂移 / 分位）都在后端算好（铁律 4.5），前端只展示。
 *
 * 优先级来自后端 today_items：
 *   1 证伪触发（红）→ 2 剧本命中（橙）→ 3 裸仓（黄）→ 4 复核到期（蓝）→ 5 没事。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NTag, NEmpty } from 'naive-ui';
import { fetchToday, saveUnderlyingTarget, fetchRiskBoard, syncIrs } from '@/service/api';
import { syncOptionMarket, fetchSyncTask } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import TodayCard from './modules/TodayCard.vue';

defineOptions({ name: 'IrsTodayPage' });

const router = useRouter();
const loading = ref(false);
const items = ref<Api.Irs.TodayItem[]>([]);

/** 标题跳标的监测详情抽屉：复用 ?um= 入口（openFromQuery 自动开抽屉） */
function goDetail(it: Api.Irs.TodayItem) {
  router.push({ name: 'irs_underlying-monitors', query: { um: it.symbol } });
}

async function load() {
  loading.value = true;
  try {
    const { data, error } = await fetchToday();
    if (!error && data) items.value = data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ---------------- P3-1 组合风险快照 ----------------
const riskBoard = ref<Api.Irs.RiskBoard | null>(null);
const riskLoading = ref(false);
/** 阻断态原因（后端 detail 原样透出，如「在仓期权的行情日期不一致…」） */
const riskBlockMsg = ref('');
/** 同步期权行情进行中（阻断态的修复入口） */
const syncRunning = ref(false);
let syncTimer: number | undefined;

onUnmounted(() => window.clearTimeout(syncTimer));

/** 从 axios 错误体取 FastAPI 的 detail（silent 请求不弹全局 toast，这里内联展示） */
function detailOf(error: unknown): string {
  const err = error as { response?: { data?: { detail?: string } } };
  return err?.response?.data?.detail ?? '';
}

async function loadRisk() {
  riskLoading.value = true;
  try {
    const { data, error } = await fetchRiskBoard({ horizon: 'now', iv_mult: 1.0 }, { silent: true });
    if (error || !data) {
      riskBlockMsg.value = detailOf(error) || '风险快照计算失败';
      riskBoard.value = null;
      return;
    }
    riskBlockMsg.value = '';
    riskBoard.value = data;
  } finally {
    riskLoading.value = false;
  }
}

/**
 * 阻断态修复入口：一键同步期权行情（后台任务），轮询到终态后自动重试风险快照。
 * 同步任务与批量同步全局互斥（409），失败原样提示；轮询上限 2 分钟。
 */
async function syncOptionThenRetry() {
  if (syncRunning.value) return;
  window.clearTimeout(syncTimer);
  const { data: task, error } = await syncOptionMarket({ silent: true });
  if (error || !task) {
    window.$message?.error(detailOf(error) || '同步任务启动失败');
    return;
  }
  syncRunning.value = true;
  const started = Date.now();
  const poll = async () => {
    const { data: t } = await fetchSyncTask(task.id);
    if (t && t.status === 'running' && Date.now() - started < 120_000) {
      syncTimer = window.setTimeout(poll, 3000);
      return;
    }
    syncRunning.value = false;
    if (t && t.status === 'done') {
      window.$message?.success('期权行情同步完成');
    } else {
      window.$message?.warning(`同步未完成（${t?.status ?? '超时'}），可稍后在基础数据页重试`);
    }
    loadRisk();
  };
  poll();
}

// 今日页打开就拉一次风险快照；risk-board 是独立的引擎，不依赖 today_items 的命中
loadRisk();

/** 需要动作的标的数（priority < 5）——「今天只有几件事」的一眼答卷 */
const activeCount = computed(() => items.value.filter(i => i.priority < 5).length);

/** 没事的卡片弱化，把注意力留给需要动作的 */
function cardClass(it: Api.Irs.TodayItem) {
  return it.priority >= 5 ? 'opacity-55' : '';
}

// ---------------- 目标仓位编辑（P3-2） ----------------
const showTargetModal = ref(false);
const targetSymbol = ref('');
const targetValue = ref<number | null>(null);
const savingTarget = ref(false);

function startEditTarget(it: Api.Irs.TodayItem) {
  targetSymbol.value = it.symbol;
  targetValue.value = it.target_pct;
  showTargetModal.value = true;
}

async function saveTarget() {
  savingTarget.value = true;
  try {
    const { error } = await saveUnderlyingTarget(targetSymbol.value, targetValue.value);
    if (!error) {
      window.$message?.success('目标仓位已保存');
      showTargetModal.value = false;
      load();
    }
  } finally {
    savingTarget.value = false;
  }
}

// ---------------- 同步实时行情（与估值监测页同接口：syncIrs('underlying-monitor')） ----------------
const quoteSyncLoading = ref(false);

/** gm current 拉最新价并重算 pv_*，成功后重拉今日清单（刻度条/分位随价格更新） */
async function handleSyncQuote() {
  await executeSync(() => syncIrs('underlying-monitor'), quoteSyncLoading, load);
}
</script>

<template>
  <div class="p-16px">
    <div class="mb-16px flex flex-wrap items-center gap-12px">
      <span class="text-16px font-600">今日待办</span>
      <NTag v-if="activeCount" size="small" :bordered="false" round>{{ activeCount }} 个需要动作</NTag>
      <NTag v-else type="success" size="small" :bordered="false" round>今天没事</NTag>
      <!-- 标的推演入口：左侧调价、右侧联动算（独立路由，不挤占今日待办清单） -->
      <NButton size="tiny" @click="router.push({ name: 'irs_simulate' })">标的推演</NButton>
      <NButton size="tiny" text class="ml-auto" :loading="quoteSyncLoading" @click="handleSyncQuote">同步行情</NButton>
      <NButton size="tiny" text @click="load">刷新</NButton>
    </div>

    <!-- P3-1 组合风险快照：前端只读聚合 risk-board，全账户视角 -->
    <!-- 阻断态（409：行情过期/混日）：内联提示 + 一键同步期权行情，不静默空白 -->
    <NAlert v-if="riskBlockMsg && !riskLoading" type="warning" :bordered="false" class="mb-16px">
      <div class="flex flex-wrap items-center gap-8px">
        <span class="font-500">风险快照不可用</span>
        <span class="text-12px">{{ riskBlockMsg }}</span>
        <NButton size="tiny" class="ml-auto" :loading="syncRunning" @click="syncOptionThenRetry">
          {{ syncRunning ? '同步中…' : '同步期权行情并重试' }}
        </NButton>
      </div>
    </NAlert>
    <div v-if="riskBoard && !riskLoading" class="mb-16px rounded-8px border border-gray-200 p-12px">
      <div class="mb-8px flex flex-wrap items-center gap-8px text-12px">
        <span class="font-500">组合风险快照（即期口径）</span>
        <span class="text-gray-400">引擎 {{ riskBoard.engine_ver }} · {{ riskBoard.calc_date }}</span>
        <NButton size="tiny" text class="ml-auto" @click="loadRisk">刷新</NButton>
      </div>
      <div class="flex flex-wrap items-center gap-12px text-12px">
        <!-- 组合保证金率 -->
        <span>
          净资产
          <b>{{ Number(riskBoard.net_total).toLocaleString() }}</b>
          <span class="mx-4px text-gray-300">|</span>
          保证金
          <b>{{ Number(riskBoard.margin_total).toLocaleString() }}</b>
          <span class="mx-4px text-gray-300">|</span>
          保证金率
          <b>
            {{ riskBoard.net_total ? ((riskBoard.margin_total / riskBoard.net_total) * 100).toFixed(1) + '%' : '—' }}
          </b>
        </span>
        <!-- 无上限短 call 标记 -->
        <NTag v-if="riskBoard.max_exposure_unbounded" size="tiny" :bordered="false" round>
          理论上行无上限（短 call）
        </NTag>
        <!-- 首追保点 -->
        <template v-for="(fc, modeKey) in riskBoard.first_call" :key="modeKey">
          <span v-if="fc" :class="Math.abs(fc.drop) < 5 ? 'text-red-500 font-600' : ''">
            {{ modeKey === 'now' ? '即期' : modeKey === 'expiry' ? '到期' : modeKey }} 首追保
            <b>
              {{ fc.direction === 'down' ? '跌' : fc.direction === 'up' ? '涨' : '' }}
              {{ Math.abs(fc.drop).toFixed(1) }}%
            </b>
            <span v-if="Math.abs(fc.drop) < 5" class="text-11px text-gray-500">（&lt; 5% 红线）</span>
          </span>
        </template>
        <!-- 数据降级提示 -->
        <NTag v-if="riskBoard.warnings?.length" size="tiny" type="warning" :bordered="false">
          {{ riskBoard.warnings[0] }}
        </NTag>
      </div>
    </div>

    <NSpin :show="loading">
      <NEmpty v-if="!items.length" description="还没有标的监测标的" class="mt-24px" />

      <!-- 0 命中时的大块提示（P0 ① 验收）：仍列出卡片（弱化），目标仓位看板照常可用 -->
      <div v-if="items.length && !activeCount" class="mb-16px">
        <NEmpty description="今天没事，关掉即可" class="mt-24px">
          <template #extra>
            <span class="text-12px text-gray-400">下面是全部标的的目标仓位看板——需要调整再打开</span>
          </template>
        </NEmpty>
      </div>

      <div v-if="items.length" class="grid grid-cols-1 gap-12px md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <TodayCard
          v-for="it in items"
          :key="it.symbol"
          :item="it"
          :class="cardClass(it)"
          @detail="goDetail(it)"
          @edit-target="startEditTarget(it)"
        />
      </div>
    </NSpin>

    <!-- 设置目标仓位抽屉（左侧） -->
    <NDrawer v-model:show="showTargetModal" placement="left" width="520px" :mask-closable="false">
      <NDrawerContent title="设置目标仓位" closable :native-scrollbar="false">
        <NForm label-placement="left" label-width="96px" :show-feedback="false">
          <NFormItem label="目标仓位(%)">
            <NInputNumber
              v-model:value="targetValue"
              :precision="2"
              :step="0.5"
              :min="0"
              :max="100"
              placeholder="占总资产比例"
              class="w-full"
            />
          </NFormItem>
          <div class="text-12px text-gray-400">决策层目标 vs 实际持仓的漂移在卡片下方看，这里只设目标</div>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showTargetModal = false">取消</NButton>
            <NButton :loading="savingTarget" @click="saveTarget">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
