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
import { ref, computed, onMounted } from 'vue';
import { NButton, NTag, NEmpty } from 'naive-ui';
import { fetchToday, saveVmTarget, fetchRiskBoard } from '@/service/api';

defineOptions({ name: 'IrsTodayPage' });

const loading = ref(false);
const items = ref<Api.Irs.TodayItem[]>([]);

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
const riskBoard = ref<Api.Bills.RiskBoard | null>(null);
const riskLoading = ref(false);

async function loadRisk() {
  riskLoading.value = true;
  try {
    const { data } = await fetchRiskBoard({ horizon: 'now', iv_mult: 1.0 });
    riskBoard.value = data ?? null;
  } catch {
    riskBoard.value = null;
  } finally {
    riskLoading.value = false;
  }
}

// 今日页打开就拉一次风险快照；risk-board 是独立的引擎，不依赖 today_items 的命中
loadRisk();

/** 优先级 → 显示标签与底色（1红 2/3橙黄 4蓝 5灰） */
const PRIORITY_META: Record<number, { label: string; type: 'error' | 'warning' | 'info' | 'default' }> = {
  1: { label: '证伪触发', type: 'error' },
  2: { label: '剧本命中', type: 'warning' },
  3: { label: '裸仓', type: 'warning' },
  4: { label: '复核到期', type: 'info' },
  5: { label: '没事', type: 'default' }
};

/** 需要动作的标的数（priority < 5）——「今天只有几件事」的一眼答卷 */
const activeCount = computed(() => items.value.filter(i => i.priority < 5).length);

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
    const { error } = await saveVmTarget(targetSymbol.value, targetValue.value);
    if (!error) {
      window.$message?.success('目标仓位已保存');
      showTargetModal.value = false;
      load();
    }
  } finally {
    savingTarget.value = false;
  }
}

/** 价格：去尾零的两位小数 */
function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return String(
    Number(v)
      .toFixed(2)
      .replace(/\.?0+$/, '')
  );
}

/** 已经是百分比刻度的值（如 target_pct / current_pct / nearest_level_pct / drift） */
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toFixed(2)}%`;
}

/** 0~1 的分位值（pe_pct / pb_pct），转百分比显示 */
function fmtPct100(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(Number(v) * 100).toFixed(1)}%`;
}

/** 漂移标色：±2% 黄、±5% 红（P3-2 超阈标色） */
function driftClass(drift: number | null | undefined) {
  if (drift == null) return '';
  const a = Math.abs(Number(drift));
  if (a >= 5) return 'text-red-500';
  if (a >= 2) return 'text-orange-500';
  return '';
}

/** 没事的卡片弱化，把注意力留给需要动作的 */
function cardClass(it: Api.Irs.TodayItem) {
  return it.priority >= 5 ? 'opacity-55' : '';
}
</script>

<template>
  <div class="p-16px">
    <div class="mb-16px flex flex-wrap items-center gap-12px">
      <span class="text-16px font-600">今日待办</span>
      <NTag v-if="activeCount" type="error" size="small" :bordered="false" round>{{ activeCount }} 个需要动作</NTag>
      <NTag v-else type="success" size="small" :bordered="false" round>今天没事</NTag>
      <NButton size="tiny" text class="ml-auto" @click="load">刷新</NButton>
    </div>

    <!-- P3-1 组合风险快照：前端只读聚合 risk-board，全账户视角 -->
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
        <NTag v-if="riskBoard.max_exposure_unbounded" size="tiny" type="error" :bordered="false" round>
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
      <NEmpty v-if="!items.length" description="还没有估值监测标的" class="mt-24px" />

      <!-- 0 命中时的大块提示（P0 ① 验收）：仍列出卡片（弱化），目标仓位看板照常可用 -->
      <div v-if="items.length && !activeCount" class="mb-16px">
        <NEmpty description="今天没事，关掉即可" class="mt-24px">
          <template #extra>
            <span class="text-12px text-gray-400">下面是全部标的的目标仓位看板——需要调整再打开</span>
          </template>
        </NEmpty>
      </div>

      <div v-if="items.length" class="grid grid-cols-1 gap-12px md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <NCard v-for="it in items" :key="it.symbol" size="small" :class="cardClass(it)">
          <template #header>
            <div class="flex flex-wrap items-center gap-8px">
              <span class="font-600">{{ it.name || it.symbol }}</span>
              <span class="text-12px text-gray-400">{{ it.symbol }}</span>
              <NTag size="tiny" :bordered="false" :type="PRIORITY_META[it.priority]?.type ?? 'default'">
                {{ PRIORITY_META[it.priority]?.label ?? it.priority }}
              </NTag>
            </div>
          </template>

          <div class="flex flex-col gap-8px">
            <!-- 现价 + 档位带 + 距最近档位 -->
            <div class="flex flex-wrap items-center gap-8px">
              <span class="text-20px font-600">{{ fmtPrice(it.price) }}</span>
              <NTag size="small" :bordered="false" type="info">{{ it.zone || '—' }}</NTag>
              <span class="text-12px text-gray-400">距档位 {{ fmtPct(it.nearest_level_pct) }}</span>
            </div>

            <!-- 档位对应 PE/PB 分位（P0-4 纠偏，仅指数标的有值，与手填档位同屏、不同底色） -->
            <div v-if="it.pe_pct != null || it.pb_pct != null" class="text-12px">
              <NTag size="tiny" :bordered="false" type="warning">
                PE {{ fmtPct100(it.pe_pct) }} / PB {{ fmtPct100(it.pb_pct) }}
              </NTag>
              <span class="ml-4px text-gray-400">10y 分位（bds 只读）</span>
            </div>

            <!-- 命中的剧本动作 -->
            <div v-if="it.hit_plans.length" class="mt-4px">
              <div class="mb-4px text-12px text-gray-500">命中剧本</div>
              <div v-for="(p, i) in it.hit_plans" :key="i" class="mb-4px text-12px">
                <NTag size="tiny" :bordered="false" type="warning">{{ p.kind }}</NTag>
                {{ p.trade_symbol }} {{ p.b_s }}{{ p.o_c || '' }}
                <span class="text-gray-400">@ {{ fmtPrice(p.effective_trigger) }}</span>
                <div v-if="p.reason" class="text-11px text-gray-400">{{ p.reason }}</div>
              </div>
            </div>

            <!-- 逻辑 / 证伪 / 复核 / 裸仓 -->
            <div class="mt-4px flex flex-wrap gap-6px text-12px">
              <NTag size="tiny" :bordered="false" :type="it.logic_weak ? 'warning' : 'default'">
                逻辑 {{ it.logic_total }}
                <template v-if="it.logic_weak">（减弱 {{ it.logic_weak }}）</template>
              </NTag>
              <NTag v-if="it.invalidate_triggered" size="tiny" :bordered="false" type="error">
                证伪触发 {{ it.invalidate_triggered }}
              </NTag>
              <NTag v-if="it.review_due" size="tiny" :bordered="false" type="info">复核到期</NTag>
              <NTag v-if="it.naked" size="tiny" :bordered="false" type="warning">裸仓</NTag>
            </div>

            <!-- 目标 / 当前 / 漂移（P3-2） -->
            <div class="mt-4px flex items-center gap-8px border-t border-gray-100 pt-8px text-12px">
              <span>
                目标
                <b>{{ fmtPct(it.target_pct) }}</b>
              </span>
              <span>
                当前
                <b>{{ fmtPct(it.current_pct) }}</b>
              </span>
              <span :class="driftClass(it.drift)">
                漂移
                <b>{{ fmtPct(it.drift) }}</b>
              </span>
              <NButton size="tiny" text type="primary" class="ml-auto" @click="startEditTarget(it)">设目标</NButton>
            </div>
          </div>
        </NCard>
      </div>
    </NSpin>

    <!-- 设置目标仓位 -->
    <NModal v-model:show="showTargetModal" preset="card" title="设置目标仓位" class="w-360px">
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
          <NButton type="primary" :loading="savingTarget" @click="saveTarget">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
