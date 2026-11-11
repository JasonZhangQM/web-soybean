<script setup lang="ts">
/**
 * 推演工作台（POST /irs/simulate）
 *
 * 左栏：今日标的卡片全量信息（TodayCard 复用）+ 假设价滑块；
 * 右栏：组合推演摘要 + 逐仓明细 + 口径说明，随滑块联动实时重算。
 *
 * 口径全部后端算（铁律 4.5）：pct/shift/BS 重估/义务仓保证金逐档重估/budget 预算读数。
 * 前端只做滑块几何（轴域、marks）与 debounce 调度；请求带序号防竞态。
 *
 * 双锚点（探针 _probe_um_simulate.py 验收）：
 * - 全滑块回现价时与风险看板逐值一致；
 * - 单标的假设价=档位价时与到档情景逐值一致。
 */
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NEmpty, NSlider, NTag } from 'naive-ui';
import { fetchToday, simulateIrs } from '@/service/api';
import { fmtRatio, levelColor, ratioLevel } from '@/views/irs/risk-board/modules/utils';
import TodayCard from '@/views/today/modules/TodayCard.vue';

defineOptions({ name: 'IrsSimulatePage' });

const router = useRouter();

// ---------------- 左栏：今日标的清单（与今日页同源 GET /irs/today） ----------------
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

function goDetail(it: Api.Irs.TodayItem) {
  router.push({ name: 'irs_underlying-monitors', query: { um: it.symbol } });
}

// ---------------- 假设价状态与滑块几何 ----------------
/** {标的代码: 假设价}；不设 = 现价（用 Map 规避动态 delete，reactive Map 可深度监听） */
const overrides = reactive(new Map<string, number>());

/** 五档价（TodayItem.pp 透传）；无版本标的为空数组 */
function tierSeq(it: Api.Irs.TodayItem): number[] {
  const pp = it.pp;
  if (!pp) return [];
  return [pp.pp_el, pp.pp_l, pp.pp_m, pp.pp_h, pp.pp_eh].map(v => (v == null ? NaN : Number(v)));
}

/** 滑块轴域：有五档 = [min(五档,现价)×0.9, max(五档,现价)×1.1]；无五档 = 现价×[0.7,1.3] */
function axisOf(it: Api.Irs.TodayItem) {
  const price = it.price == null ? null : Number(it.price);
  if (price == null || price <= 0) return null;
  const seq = tierSeq(it).filter(v => !Number.isNaN(v) && v > 0);
  if (seq.length === 5) {
    return { lo: Math.min(...seq, price) * 0.9, hi: Math.max(...seq, price) * 1.1, tiers: seq };
  }
  return { lo: price * 0.7, hi: price * 1.3, tiers: [] };
}

/** 滑块步长按量纲：跨度 >500 取 1，>50 取 0.1，否则 0.01 */
function stepOf(ax: { lo: number; hi: number } | null) {
  if (!ax) return 1;
  const span = ax.hi - ax.lo;
  if (span > 500) return 1;
  if (span > 50) return 0.1;
  return 0.01;
}

/** 五档 marks（NSlider marks：{位置值: 标签}；档位价不在轴内跳过） */
function marksOf(it: Api.Irs.TodayItem) {
  const ax = axisOf(it);
  if (!ax || !ax.tiers.length) return undefined;
  const names = ['极低', '低', '中', '高', '极高'];
  const marks: Record<number, string> = {};
  ax.tiers.forEach((v, i) => {
    if (v >= ax.lo && v <= ax.hi) marks[Number(v.toFixed(2))] = names[i];
  });
  return Object.keys(marks).length ? marks : undefined;
}

function setHypo(it: Api.Irs.TodayItem, v: number | null) {
  if (v == null || (it.price != null && Math.abs(Number(v) - Number(it.price)) < 1e-9)) {
    overrides.delete(it.symbol);
  } else {
    overrides.set(it.symbol, Number(v));
  }
}

function resetHypo(it: Api.Irs.TodayItem) {
  overrides.delete(it.symbol);
}

function resetAll() {
  overrides.clear();
}

const changedCount = computed(() => overrides.size);

// ---------------- 右栏：推演结果（debounce 400ms，序号防竞态） ----------------
const horizon = ref<'now' | 'expiry'>('now');
const ivMult = ref(1.0);
const result = ref<Api.Irs.SimulateResult | null>(null);
const simLoading = ref(false);
const simError = ref('');
let simSeq = 0;
let debounceTimer: number | undefined;

async function runSim() {
  const seq = (simSeq += 1);
  simLoading.value = true;
  simError.value = '';
  try {
    const { data, error } = await simulateIrs({
      overrides: Object.fromEntries(overrides),
      horizon: horizon.value,
      iv_mult: ivMult.value
    });
    if (seq !== simSeq) return; // 已有更新请求，丢弃旧响应
    if (error || !data) {
      simError.value =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '推演计算失败';
      result.value = null;
      return;
    }
    result.value = data;
  } finally {
    if (seq === simSeq) simLoading.value = false;
  }
}

watch([() => Array.from(overrides.entries()), horizon, ivMult], () => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(runSim, 400);
});

onMounted(() => {
  // 首次立即算一次 0% 基准（与风险看板对照）
  runSim();
});

function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPctN(v: number | null | undefined, digits = 2) {
  if (v == null) return '—';
  return `${(Number(v) * 100).toFixed(digits)}%`;
}

function signCls(v: number | null | undefined) {
  if (v == null || Math.abs(Number(v)) < 1e-9) return '';
  return Number(v) > 0 ? 'text-green-500' : 'text-red-500';
}

/** 盈亏单元格：沿用风险看板/五档情景口径，盈绿亏红 */
function pnlCell(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { class: signCls(n) }, fmtMoney(n));
}

/** 保证金变化：占用增加染红、减少染绿，显示带符号原值（不取相反数） */
function marginCell(v: number | null | undefined) {
  const n = Number(v ?? 0);
  const cls = n > 0 ? 'text-red-500' : n < 0 ? 'text-green-500' : '';
  return h('span', { class: cls }, `${n > 0 ? '+' : ''}${fmtMoney(n)}`);
}

/** 风险度：4 位小数 + 分档配色（复用风险看板/档位 Tab 的同一套 utils） */
function ratioCell(v: number | null | undefined) {
  return h('span', { style: { color: levelColor(ratioLevel(v)) } }, fmtRatio(v));
}

/** 假设价读数（滑块下方）：假设 X（±pct%）· 落入 zone_at */
function hypoText(it: Api.Irs.TodayItem) {
  const v = overrides.get(it.symbol);
  if (v == null) return { main: '= 现价', zone: '' };
  const price = it.price == null ? null : Number(it.price);
  const pct = price ? (Number(v) / price - 1) * 100 : null;
  const zoneAt = result.value?.subjects[it.symbol]?.zone_at;
  return {
    main: `${fmtPrice(v)}（${pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}）`,
    zone: zoneAt ? ` · 落入「${zoneAt}」` : ''
  };
}

/** 标的排序键：取显示用名称，未归属（显示「—」）为空串 */
function subjectLabel(r: Api.Irs.SimulatePositionRow) {
  return r.subject_name || r.subject || '';
}

/**
 * 列头 sorter：只比较名称本身，空串按 localeCompare 自然排最前（默认倒序下即最后）。
 * 不在这里特判空值 —— Naive UI 的 descend 会对整个比较结果取反，特判会把「—」翻到表格顶部。
 */
function compareSubject(a: Api.Irs.SimulatePositionRow, b: Api.Irs.SimulatePositionRow) {
  return subjectLabel(a).localeCompare(subjectLabel(b), 'zh-Hans-CN');
}

/**
 * 逐仓明细行：默认按标的列倒序（同标的聚拢），未归属（—）固定排最后；
 * 改价行仍以底色高亮区分，_rk 供 virtual-scroll 稳定复用行。
 * 同标的内部按 账户 → 合约 → 行权价 升序，不随标的倒序翻转。
 */
const positionRows = computed(() => {
  const rows = result.value?.position_rows ?? [];
  const sorted = [...rows].sort((a, b) => {
    const ka = subjectLabel(a);
    const kb = subjectLabel(b);
    if (!ka || !kb) return ka === kb ? 0 : ka ? -1 : 1;
    return (
      kb.localeCompare(ka, 'zh-Hans-CN') ||
      String(a.acct ?? '').localeCompare(String(b.acct ?? '')) ||
      String(a.name ?? '').localeCompare(String(b.name ?? '')) ||
      Number(a.strike ?? 0) - Number(b.strike ?? 0)
    );
  });
  return sorted.map((r, i) => ({ ...r, _rk: `${r.acct}/${r.name}/${r.kind}/${r.strike ?? ''}/${i}` }));
});

/**
 * 列宽全部用 width（不用 minWidth）：scroll-x 按列宽和自动求和（🔒4.11）。
 * NDataTable 不写 size（🔒4.7）：全局主题只压 medium 到 4px 8px，写 small 反而更高。
 */
const positionCols = computed(() => [
  {
    key: 'subject',
    title: '标的',
    width: 100,
    sorter: compareSubject,
    defaultSortOrder: 'descend' as const,
    render: (r: Api.Irs.SimulatePositionRow) => r.subject_name || r.subject || '—'
  },
  { key: 'acct', title: '账户', width: 64 },
  { key: 'name', title: '合约', width: 170 },
  {
    key: 'dir',
    title: '方向',
    width: 84,
    render: (r: Api.Irs.SimulatePositionRow) => {
      if (r.kind === 'call' || r.kind === 'put') return `${r.kind === 'call' ? '购' : '沽'} ${r.strike ?? ''}`;
      return r.qty != null && Number(r.qty) > 0 ? '多' : '空';
    }
  },
  { key: 'qty', title: '数量', width: 64, render: (r: Api.Irs.SimulatePositionRow) => Math.abs(Number(r.qty ?? 0)) },
  {
    key: 'price',
    title: '基准价→情景价',
    width: 150,
    render: (r: Api.Irs.SimulatePositionRow) => `${fmtPrice(r.price_now)}→${fmtPrice(r.price_at)}`
  },
  {
    key: 'pf_now',
    title: '当前盈亏',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlCell(r.pf_now)
  },
  {
    key: 'delta_pnl_now',
    title: horizon.value === 'now' ? '即期Δ盈亏 · 主' : '即期Δ盈亏',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlCell(r.delta_pnl_now)
  },
  {
    key: 'delta_pnl_expiry',
    title: horizon.value === 'expiry' ? '到期Δ盈亏 · 主' : '到期Δ盈亏',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => pnlCell(r.delta_pnl_expiry)
  },
  {
    key: 'margin_at',
    title: '到档保证金',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => fmtMoney(r.margin_at)
  },
  {
    key: 'margin_delta',
    title: '保证金变化',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => marginCell(r.margin_delta)
  },
  {
    key: 'risk_exposure',
    title: '风险敞口',
    width: 110,
    align: 'right' as const,
    render: (r: Api.Irs.SimulatePositionRow) => fmtMoney(r.risk_exposure)
  }
]);

/**
 * 分账户风险指标：列集合照搬 underlying-monitors 档位 Tab 的 accountColumns，
 * 另加「保证金变化」（相对 0% 基准）。所有数值后端现算，前端不自算（🔒4.13）。
 */
const accountCols = computed(() => [
  { key: 'account', title: '账户', width: 70 },
  {
    key: 'pf_now',
    title: '账户当前盈亏',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlCell(a.pf_now)
  },
  {
    key: 'delta_pnl_now',
    title: horizon.value === 'now' ? '即期Δ盈亏 · 主' : '即期Δ盈亏',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlCell(a.delta_pnl_now)
  },
  {
    key: 'delta_pnl_expiry',
    title: horizon.value === 'expiry' ? '到期Δ盈亏 · 主' : '到期Δ盈亏',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => pnlCell(a.delta_pnl_expiry)
  },
  {
    key: 'net_at',
    title: '到档净值',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoney(a.net_at)
  },
  {
    key: 'eq_at',
    title: '客户权益',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoney(a.eq_at)
  },
  {
    key: 'margin_at',
    title: '保证金',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtMoney(a.margin_at)
  },
  {
    key: 'margin_delta',
    title: '保证金变化',
    width: 110,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => marginCell(a.margin_delta)
  },
  {
    key: 'real',
    title: '真实风险度',
    width: 100,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => ratioCell(a.real)
  },
  {
    key: 'exch',
    title: '交易所风险度',
    width: 100,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => ratioCell(a.exch)
  },
  {
    key: 'coverage',
    title: '覆盖率',
    width: 100,
    align: 'right' as const,
    render: (a: Api.Irs.SimulateAccount) => fmtRatio(a.coverage)
  },
  {
    key: 'breached',
    title: '追保(模型)',
    width: 90,
    render: (a: Api.Irs.SimulateAccount) =>
      a.breached ? h(NTag, { type: 'error', size: 'small', bordered: false }, { default: () => '越线' }) : '—'
  }
]);

/** scroll-x = 列宽和：加列/改列宽不再需要手改常量（🔒4.11） */
function sumWidth(cols: Array<{ width?: number }>) {
  return cols.reduce((s, c) => s + Number(c.width ?? 0), 0);
}
const scrollX = computed(() => sumWidth(positionCols.value as Array<{ width?: number }>));
const accountScrollX = computed(() => sumWidth(accountCols.value as Array<{ width?: number }>));

const rowProps = (r: Api.Irs.SimulatePositionRow) => ({
  style: r.changed ? 'background: rgba(93,202,165,0.08);' : ''
});
</script>

<template>
  <div class="h-full flex flex-col gap-12px p-16px">
    <!-- 顶栏：时点 / IV / 重置 -->
    <div class="flex flex-wrap items-center gap-12px">
      <span class="text-16px font-600">推演工作台</span>
      <NTag size="small" :bordered="false" round>
        {{ changedCount ? `${changedCount} 个标的已改动` : '全部现价（0% 基准）' }}
      </NTag>
      <div class="flex items-center gap-6px text-12px">
        <span class="text-gray-400">时点</span>
        <NButton size="tiny" :type="horizon === 'now' ? 'primary' : 'default'" @click="horizon = 'now'">即期</NButton>
        <NButton size="tiny" :type="horizon === 'expiry' ? 'primary' : 'default'" @click="horizon = 'expiry'">
          到期
        </NButton>
      </div>
      <div class="flex items-center gap-6px text-12px">
        <span class="text-gray-400">IV ×</span>
        <NSlider
          v-model:value="ivMult"
          :min="0.5"
          :max="2"
          :step="0.05"
          :format-tooltip="(v: number) => `×${v.toFixed(2)}`"
          class="w-120px"
          :disabled="simLoading"
        />
        <span class="w-40px">{{ ivMult.toFixed(2) }}</span>
      </div>
      <NButton size="tiny" text class="ml-auto" :disabled="!changedCount" @click="resetAll">全部回现价</NButton>
      <NButton size="tiny" text @click="load">刷新标的</NButton>
    </div>

    <!-- 左右两栏 -->
    <div class="min-h-0 flex flex-1 gap-12px">
      <!-- 左栏：标的卡片 + 滑块 -->
      <div class="w-380px flex-none overflow-y-auto pr-4px">
        <NEmpty v-if="!items.length && !loading" description="还没有标的监测标的" class="mt-24px" />
        <div class="flex flex-col gap-12px">
          <TodayCard
            v-for="it in items"
            :key="it.symbol"
            :item="it"
            :hypo-price="overrides.get(it.symbol) ?? null"
            :changed="overrides.has(it.symbol)"
            @detail="goDetail(it)"
          >
            <template #footer>
              <div class="border-t border-gray-100 pt-8px">
                <NSlider
                  :value="overrides.get(it.symbol) ?? it.price ?? 0"
                  :min="axisOf(it)?.lo"
                  :max="axisOf(it)?.hi"
                  :step="stepOf(axisOf(it))"
                  :marks="marksOf(it)"
                  :tooltip-formatter="(v: number) => fmtPrice(v)"
                  :disabled="!it.price"
                  @update:value="(v: number) => setHypo(it, v)"
                />
                <div class="mt-6px flex items-center justify-between text-12px">
                  <span :class="overrides.has(it.symbol) ? 'text-green-500' : 'text-gray-400'">
                    假设 {{ hypoText(it).main }}{{ hypoText(it).zone }}
                  </span>
                  <NButton v-if="overrides.has(it.symbol)" size="tiny" text @click="resetHypo(it)">回现价</NButton>
                </div>
              </div>
            </template>
          </TodayCard>
        </div>
      </div>

      <!-- 右栏：推演详情 -->
      <div class="min-w-0 flex-1 overflow-y-auto">
        <NEmpty v-if="simError" :description="simError" class="mt-24px" />
        <template v-else-if="result">
          <!-- 组合摘要 -->
          <NCard size="small" class="mb-12px">
            <div class="mb-8px flex flex-wrap items-center gap-8px text-12px">
              <span class="font-500">组合推演</span>
              <NTag size="tiny" :bordered="false" round>{{ result.horizon === 'now' ? '即期' : '到期' }}</NTag>
              <NTag size="tiny" :bordered="false">IV ×{{ result.iv_mult.toFixed(2) }}</NTag>
              <span class="text-gray-400">
                引擎 {{ result.engine_ver }} · {{ result.as_of || '—' }}
                <template v-if="result.stale_days != null && result.stale_days > 0">
                  ·
                  <span class="text-orange-500">行情滞后 {{ result.stale_days }} 个交易日</span>
                </template>
              </span>
              <span v-if="simLoading" class="ml-auto text-gray-400">计算中…</span>
            </div>
            <div class="flex flex-wrap gap-12px text-12px">
              <span>
                净资产
                <b>{{ fmtMoney(result.combo.net_at) }}</b>
              </span>
              <span>
                保证金
                <b>{{ fmtMoney(result.combo.margin_total) }}</b>
                <span class="ml-4px" :class="signCls(result.combo.margin_total - result.baseline_combo.margin_total)">
                  （{{ result.combo.margin_total - result.baseline_combo.margin_total >= 0 ? '+' : ''
                  }}{{ fmtMoney(result.combo.margin_total - result.baseline_combo.margin_total) }}）
                </span>
              </span>
              <span>
                风险度
                <b>{{ fmtPctN(result.combo.real) }}</b>
                <span class="text-gray-400">真实</span>
                <span class="mx-4px text-gray-300">|</span>
                <b>{{ fmtPctN(result.combo.exch) }}</b>
                <span class="text-gray-400">交易所</span>
              </span>
              <span :class="signCls(-result.combo.loss)">
                组合 Δ盈亏
                <b>{{ fmtMoney(-result.combo.loss) }}</b>
              </span>
              <span>
                预算（现价基准）
                <NTag
                  size="tiny"
                  :bordered="false"
                  :type="
                    result.budget.summary.verdict === 'ok'
                      ? 'success'
                      : result.budget.summary.verdict === 'block'
                        ? 'error'
                        : 'warning'
                  "
                >
                  {{ result.budget.summary.verdict }}
                </NTag>
                余量
                <b>{{ fmtMoney(result.budget.summary.headroom_total) }}</b>
              </span>
              <NTag
                v-if="result.budget.summary.blocked_accounts.length"
                size="tiny"
                :bordered="false"
                type="error"
                round
              >
                禁开：{{ result.budget.summary.blocked_accounts.join(' / ') }}
              </NTag>
            </div>
          </NCard>

          <!-- 改价标的假设态小结 -->
          <NCard v-if="changedCount" size="small" class="mb-12px">
            <div class="flex flex-col gap-8px">
              <div
                v-for="(sym, i) in result.changed_symbols"
                :key="sym"
                class="flex flex-wrap items-center gap-8px text-12px"
                :class="i > 0 ? 'border-t border-gray-100 pt-8px' : ''"
              >
                <span class="font-500">{{ result.subjects[sym]?.name || sym }}</span>
                <span class="text-gray-400">{{ sym }}</span>
                <span>
                  假设
                  <b>{{ fmtPrice(result.subjects[sym]?.price_at) }}</b>
                  （{{ (Number(result.subjects[sym]?.pct) * 100).toFixed(1) }}%）
                </span>
                <NTag size="tiny" :bordered="false" type="info">
                  {{ result.subjects[sym]?.zone_now }} → {{ result.subjects[sym]?.zone_at }}
                </NTag>
                <span :class="signCls(result.subjects[sym]?.delta_pnl)">
                  Δ盈亏
                  <b>{{ fmtMoney(result.subjects[sym]?.delta_pnl) }}</b>
                </span>
                <span>
                  到档浮盈
                  <b :class="signCls(result.subjects[sym]?.pf_at_level)">
                    {{ fmtMoney(result.subjects[sym]?.pf_at_level) }}
                  </b>
                </span>
                <span>
                  保证金Δ
                  <b>{{ fmtMoney(result.subjects[sym]?.margin_delta) }}</b>
                </span>
                <!-- 假设价剧本命中判定 -->
                <span
                  v-for="p in result.subjects[sym]?.plans_at ?? []"
                  :key="p.seq"
                  class="text-11px"
                  :class="p.hit_at ? 'text-orange-500 font-500' : 'text-gray-400'"
                >
                  剧本{{ p.trade_symbol }} {{ p.b_s }}{{ p.o_c || '' }} @ {{ fmtPrice(p.effective_trigger) }}
                  {{ p.hit_at ? '命中' : '未到' }}
                </span>
              </div>
            </div>
          </NCard>

          <!-- 逐仓明细 -->
          <NCard size="small" class="mb-12px">
            <div class="mb-8px text-12px text-gray-400">
              逐仓明细（默认按标的倒序、同标的聚拢，点击「标的」列头可切换排序；改价行底色高亮；当前主时点
              {{ horizon === 'now' ? '即期' : '到期' }}， 顶部切换只影响组合摘要；Σ主时点 Δ盈亏 = 组合 Δ盈亏，可对账）
            </div>
            <div class="mb-8px text-11px text-gray-400">
              「当前盈亏」为账单账面静态浮盈，Δ盈亏为模型盯市增量，两者基准不同、不可相加对账；
              「风险敞口」为人工确认值，空 = 未设置。
            </div>
            <NDataTable
              :columns="positionCols"
              :data="positionRows"
              :row-props="rowProps"
              :row-key="(r: any) => r._rk"
              :scroll-x="scrollX"
              :max-height="420"
              virtual-scroll
              table-layout="fixed"
              :bordered="false"
              :single-line="false"
              class="sim-data-table"
            />
          </NCard>

          <!-- 分账户风险指标（列集合照搬档位 Tab） -->
          <NCard size="small" class="mb-12px">
            <div class="mb-8px text-12px text-gray-400">
              分账户风险指标（{{ result.accounts.length }} 个账户；主时点 {{ horizon === 'now' ? '即期' : '到期' }}，
              顶部切换只影响组合摘要；Σ主时点 Δ盈亏 = 组合 Δ盈亏，可对账）
            </div>
            <div class="mb-8px text-11px text-gray-400">
              「账户当前盈亏」为账户层面全部持仓账面浮盈，两列 Δ盈亏为账户全部持仓的模型盯市增量，
              两者基准不同、不可相加对账；「保证金变化」相对 0% 基准。追保只判交易所口径； 真实口径 ≥1 而交易所口径
              &lt;1 时须单独留意；空账户不展示。
            </div>
            <NDataTable
              :columns="accountCols"
              :data="result.accounts"
              :scroll-x="accountScrollX"
              table-layout="fixed"
              :bordered="false"
              :single-line="false"
              class="sim-data-table"
            />
          </NCard>

          <!-- 口径说明 -->
          <NCard size="small">
            <div class="text-12px text-gray-400">口径与告警（{{ result.warnings.length }} 条）</div>
            <ul class="mt-4px list-disc pl-18px text-11px text-gray-400 leading-relaxed">
              <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              <li>预算读数为现价基准（0% 与 +15% 全组同跌），不随滑块假设价变化。</li>
            </ul>
          </NCard>
        </template>
        <NEmpty v-else description="拖动左侧滑块开始推演" class="mt-48px" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 单元格一律不折行：合约名（CFFEX.IO2611-P-4000）在窄列里会断成两行，把行高撑成两倍。
 * 必须用 :deep()——th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上。
 * 配合列宽和（scroll-x）与 table-layout="fixed"，列宽才是硬约束（🔒4.11）。
 */
.sim-data-table :deep(.n-data-table-th),
.sim-data-table :deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
