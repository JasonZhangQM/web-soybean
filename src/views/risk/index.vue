<script setup lang="ts">
/**
 * 风险总览（/risk，2026-11-13 起为顶级菜单、与首页平级，也是登录默认落地页）
 *
 * 页面本体由原「标的推演」(/irs/simulate) 升级而来：它把标的档位、账户风险、
 * 五档压力、逐仓明细与组合推演放在同一屏，是风险监控与分析的唯一总入口。
 *
 * 左栏：标的监测行卡片（SubjectCard），档位条即假设价滑块（2026-11-15 合一）；
 * 右栏自上而下（2026-11-15）：② 档位压力表（档位选择唯一入口，先选档）→ ① 账户总表
 *   → ③ 逐仓总表 → ④ 推演区（保证金结构图 / 组合推演 / 改价小结）。
 *   ⓪ 组合快照表同日整节删除（原有行情新鲜度已移到顶栏）；①②③④ 是绑定组件的分节代号、
 *   不随位置变，组件内注释一律沿用这套编号，⓪ 留空号不复用。
 *
 * ①③ 是 2026-11-13 二次整合后的唯一表：账户风险列表 + 分账户风险指标 → 账户总表，
 * 逐张合约 + 逐仓明细 → 逐仓总表。两表在组件内按「账户」/「账户+合约」join 两路数据，
 * 用两级分组表头把「账户(静态)」与「当前假设·到档（随滑块变）」隔开
 * （账户总表的现价基准列组已于 2026-11-13 删除；现价口径不再逐账户出列，
 *   滑块归零的 0% 基准行即现价口径）。
 * 顶栏固定槽位常驻「行情新鲜度」（2026-11-15 从组合快照表移出，同日该表整节删除），
 * 看板未就绪也占位，推演失败 / 未算完照样能看到行情快照日与滞后交易日数。
 *
 * 三路数据、各司其职，不互相推算：
 * - GET /irs/risk-board：账户静态卡 / 风险预算 / 逐仓静态列；
 * - POST /irs/simulate/levels：五档档位压力 → 压力表、保证金结构图、档位口径首个追保；
 * - POST /irs/simulate：当前假设价推演 → 组合摘要、改价小结，以及两张总表的到档组。
 *
 * 口径全部后端算（🔒4.13）：前端只做档位条几何、批量套用、join / 排序与 debounce 调度；
 * 请求带序号防竞态。**全标的批量**档位选择唯一入口 = ② 档位压力表（含「现价」基准行），
 * 点击整行 = 批量套用该档到左栏假设价（所见即所得）；顶栏不再重复放批量按钮。
 * 单标的改价走卡片：拖色带 / 点五档标签（等价于旧滑块），不新增第二个批量入口；
 * 无五档版本的标的才在卡片 footer 保留一个降级 NSlider，否则这类标的无法设假设价。
 * IV / 行情变化时三路一起重算、全部就绪后才刷新两张总表，避免静态列与到档列错配。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton, NEmpty, NSlider, NTag, NTooltip } from 'naive-ui';
import {
  fetchRiskBoard,
  fetchUnderlyingMonitors,
  simulateIrs,
  simulateLevels,
  syncGroup,
  syncIrs
} from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { createTablePagination } from '@/hooks/common/table';
import { usePageState } from '@/hooks/common/page-state';
/** 左栏标的卡片：今日待办下线后由 TodayCard 精简而来（去掉待办标签，只留现价/分位/档位条） */
import SubjectCard from './modules/SubjectCard.vue';
import { type SubjectRow, type TierBand, toSubjectRow } from './modules/types';
/** 标的档案抽屉：直接用标的监测页那一个组件，不复制版式、不跳页（2026-11-13） */
import DetailDrawer from '@/views/irs/underlying-monitors/modules/DetailDrawer.vue';
/** 编辑标的抽屉：与标的监测列表页共用，点「编辑标的信息」原地弹出、不跳页（2026-11-16） */
import EditDrawer from '@/views/irs/underlying-monitors/modules/EditDrawer.vue';
/** 右侧各分节的标题栏：直接复用标的监测抽屉档位 Tab 的 SectionBar（灰底横条 + 左色条），样式源唯一 */
import SectionBar from '@/views/irs/underlying-monitors/modules/SectionBar.vue';
/** ①③ 两张总表 + ④ 保证金结构图：原 /irs/risk-board 共享组件目录（旧页面已下线） */
import AccountRiskList from '@/views/irs/risk-board/modules/AccountRiskList.vue';
import ContractTable from '@/views/irs/risk-board/modules/ContractTable.vue';
import MarginStackChart from '@/views/irs/risk-board/modules/MarginStackChart.vue';
/** ② 档位压力表：替代旧 11 档涨跌幅情景表 */
import LevelPressureTable from './modules/LevelPressureTable.vue';
/** 顶栏行情新鲜度 + ① 到档口径说明：都来自 risk-board/utils，避免文案另写一份 */
import { ACCOUNT_AT_NOTES, fmtMoneyShort, staleLabel, staleLevel } from '@/views/irs/risk-board/modules/utils';

defineOptions({ name: 'RiskOverviewPage' });

const router = useRouter();

/** 账户视角：唯一页面筛选态，走 usePageState 内存态、不落 localStorage（🔒4.2） */
const query = reactive({ account: 'ALL' });
const pagination = createTablePagination();
usePageState({ searchParams: query, pagination });

function selectAccount(account: string) {
  query.account = account;
}

// ---------------- 左栏：标的监测清单（GET /irs/underlying-monitors） ----------------
/**
 * 数据源由 GET /irs/today 换成本页唯一需要的标的监测表（2026-11-13 今日待办下线）：
 * 那张表本来就是 um 主表，五档 pp_* / 距档 pv_* / 分位 / zone 全在，只是列存成字符串，
 * 由 toSubjectRow 一次性归一化；raw 留着开抽屉当骨架，省一次按 symbol 的回查。
 */
const loading = ref(false);
const items = ref<SubjectRow[]>([]);

async function load() {
  loading.value = true;
  try {
    const { data, error } = await fetchUnderlyingMonitors({ limit: 200 });
    if (!error && data?.items) items.value = data.items.map(toSubjectRow);
  } finally {
    loading.value = false;
  }
}

// 首屏统一在下方 onMounted 里并行拉三路数据，不在各自区块分散挂载（避免重复请求）

/**
 * 左栏标的卡片栏显示开关（2026-11-16）：内存态、不落 localStorage（🔒4.2 精神，每次进页默认展开）。
 * 收起后右栏 flex-1 自动占满；批量套档唯一入口在 ② 压力表（右栏），收起左栏不影响批量改价，
 * 单标的拖档位条需要先展开。
 */
const showLeft = ref(true);

// ---------------- 标的档案抽屉（2026-11-13：跳页改为页内弹窗） ----------------
/**
 * 左栏点标的：就地打开与 /irs/underlying-monitors 完全同一个 DetailDrawer。
 * 左栏数据本身就是监测行（SubjectRow.raw），直接当骨架传，不必再按 symbol 回查一次。
 */
const showDrawer = ref(false);
const drawerRow = ref<Api.Irs.UnderlyingMonitor | null>(null);
/** 编辑保存后调 refresh() 静默重拉档案，标题 / 主题标签立即跟上 */
const detailDrawerRef = ref<InstanceType<typeof DetailDrawer> | null>(null);

function goDetail(it: SubjectRow) {
  drawerRow.value = it.raw;
  showDrawer.value = true;
}

/**
 * 抽屉内有写操作（改结论 / 档位 / 计划，或点「拉取最新价」同步了 um.price）时
 * 关闭才 emit 一次：重拉 /irs/underlying-monitors（档位价与 zone 可能变）+ 三路重算。
 * 与顶栏「标的行情」的区别是触发源不同：那边是本页自己点的同步。
 */
async function onDrawerChanged() {
  await load();
  await refreshAll();
}

// ---------------- 编辑标的（2026-11-16：原地弹窗，不再跳 /irs/underlying-monitors） ----------------
/**
 * 档案抽屉头部「编辑标的信息」→ 直接在本页开共享编辑抽屉。
 * 详情抽屉留在原地（右 72%）、编辑抽屉在左（520px），与标的监测列表页同一套叠层，
 * 关掉编辑就回到档案；不再 router.push 到列表页再点一次编辑。
 */
const showEdit = ref(false);
const editRow = ref<Api.Irs.UnderlyingMonitor | null>(null);

function onDrawerEdit(row: Api.Irs.UnderlyingMonitor) {
  editRow.value = row;
  showEdit.value = true;
}

/**
 * 编辑保存：重拉监测清单（档位 / 现价 / zone 可能变）→ 抽屉骨架换成同 symbol 的新行
 * → 静默重拉档案（标题 / 主题标签跟上）→ 三路重算。
 * ⚠️ DetailDrawer 只在 show / row.id 变化时 load；同 id 换个对象不会触发，必须显式 refresh()。
 * /risk 不开放删除（allowDelete=false），deleted 分支只作兜底：关掉档案抽屉再重算。
 */
async function onEditChanged({ deleted, symbol }: { deleted: boolean; symbol: string }) {
  if (deleted) {
    showDrawer.value = false;
    drawerRow.value = null;
    await load();
    await refreshAll();
    return;
  }
  await load();
  const fresh = items.value.find(i => i.symbol === symbol);
  if (fresh) drawerRow.value = fresh.raw;
  detailDrawerRef.value?.refresh();
  await refreshAll();
}

// ---------------- 假设价状态与滑块几何 ----------------
/** {标的代码: 假设价}；不设 = 现价（用 Map 规避动态 delete，reactive Map 可深度监听） */
const overrides = reactive(new Map<string, number>());

/** 五档价（types.toSubjectRow 已 Number 化）；无五档版本的标的为空数组 */
function tierSeq(it: SubjectRow): number[] {
  const pp = it.pp;
  if (!pp) return [];
  return [pp.el, pp.l, pp.m, pp.h, pp.eh].map(v => (v == null ? NaN : Number(v)));
}

/**
 * 降级 NSlider 轴域（2026-11-15 起只服务「无五档版本」分支）：
 * 同样不留 padding —— 有五档就与主路径档位条同口径 [min(五档,现价), max(五档,现价)]；
 * 真正无五档时没有任何刻度能界定轴域，只能以现价为中心构造 ±30% 可拖范围
 * （这不是 padding，否则 lo=hi 滑块完全不能动）。五档全相同导致 hi<=lo 时也退回这一档。
 * 几何唯一源仍在 TierScaleBar，此处只服务降级控件，不参与主路径。
 */
function axisOf(it: SubjectRow) {
  const price = it.price == null ? null : Number(it.price);
  if (price == null || price <= 0) return null;
  const seq = tierSeq(it).filter(v => !Number.isNaN(v) && v > 0);
  if (seq.length === 5) {
    const lo = Math.min(...seq, price);
    const hi = Math.max(...seq, price);
    if (hi > lo) return { lo, hi, tiers: seq };
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

/**
 * 五档 marks 已删除（2026-11-15）：档位条本身就是带真实刻度位置与档名的轴，
 * 比 NSlider marks 更精确；降级分支不再重复写一份硬编码档名（统一由 types.TIER_NAMES 管）。
 */

// --------- 全标的批量档位选择：唯一入口 = ② 压力表（顶栏批量按钮 2026-11-13 下线） ---------
type BatchKey = 'pp_el' | 'pp_l' | 'pp_m' | 'pp_h' | 'pp_eh' | 'price';

/** 当前生效的批量档位；手动拖色带 / 点档位标签 / 单个回现价后置 null（= 自定义组合） */
const activeBatch = ref<BatchKey | null>(null);
/** 压力表选中档位：'base' = 现价基准；与 activeBatch 同步，手动改价后退回 base */
const activeLevel = ref('base');

/** 档位键 ↔ 批量按钮键：两侧都取主表 pp_*，同源，禁止各写一份映射 */
const BATCH_TO_LEVEL: Record<string, string> = {
  pp_el: 'el',
  pp_l: 'l',
  pp_m: 'm',
  pp_h: 'h',
  pp_eh: 'eh'
};
const LEVEL_TO_BATCH: Record<string, BatchKey> = {
  el: 'pp_el',
  l: 'pp_l',
  m: 'pp_m',
  h: 'pp_h',
  eh: 'pp_eh',
  base: 'price'
};

/** 下方档位（el/l/m）：情景只向下施跌；上方档位（h/eh）：只向上施涨（修正锚方向） */
const DOWNSIDE_BATCH: ReadonlySet<string> = new Set(['pp_el', 'pp_l', 'pp_m']);

/**
 * 把全部标的的假设价套到同一档：每个标的取**自己的**档位价，不是同一个绝对值。
 * - 无版本 / 该档为空 / 非正数 ⇒ 跳过（保持现价），不把 0 / NaN 喂给滑块与后端；
 * - **修正锚（2026-11-16 用户定稿，方向感知）**：已越过档位的标的保持现价、不写
 *   override——下方档位现价已跌破该档 ⇒ 零跌幅（不反弹）、上方档位已涨破 ⇒ 零涨幅，
 *   与后端 `_level_overrides` / `tier_shifts` 同式，保证「点压力表行 → 滑块 → 推演」
 *   与压力表该行数值完全一致；
 * - clear + 多次 set 都在同一个同步块内 ⇒ watch 只合并触发一次 debounce 计算。
 */
function applyBatch(key: BatchKey) {
  overrides.clear();
  if (key !== 'price') {
    const downside = DOWNSIDE_BATCH.has(key);
    for (const it of items.value) {
      const raw = it.pp?.[key.slice(3) as TierBand];
      const v = raw == null ? null : Number(raw);
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      if (it.price != null) {
        const p = Number(it.price);
        if (downside ? v >= p - 1e-9 : v <= p + 1e-9) continue; // 已越档 ⇒ 锚定现价
      }
      overrides.set(it.symbol, v);
    }
  }
  activeBatch.value = key;
  // 压力表选中行是档位状态的唯一入口，这里只负责把两侧映射同步
  activeLevel.value = key === 'price' ? 'base' : BATCH_TO_LEVEL[key];
}

/** 点击压力表档位行 = 批量把全部标的假设价套到该档（联动，不做独立预览） */
function onSelectLevel(key: string) {
  const batch = LEVEL_TO_BATCH[key];
  if (batch) applyBatch(batch);
}

function setHypo(it: SubjectRow, v: number | null) {
  activeBatch.value = null;
  activeLevel.value = 'base';
  if (v == null || (it.price != null && Math.abs(Number(v) - Number(it.price)) < 1e-9)) {
    overrides.delete(it.symbol);
  } else {
    overrides.set(it.symbol, Number(v));
  }
}

function resetHypo(it: SubjectRow) {
  activeBatch.value = null;
  activeLevel.value = 'base';
  overrides.delete(it.symbol);
}

const changedCount = computed(() => overrides.size);

// ---------------- 右栏：推演结果（debounce 400ms，序号防竞态） ----------------
const ivMult = ref(1.0);
const result = ref<Api.Irs.SimulateResult | null>(null);
const simLoading = ref(false);
const simError = ref('');
let simSeq = 0;
let debounceTimer: number | undefined;

// ---------------- ①②③ 区数据：风险看板静态卡 + 五档档位压力（2026-11-13） ----------------
const board = ref<Api.Irs.RiskBoard | null>(null);
const boardError = ref('');
const levels = ref<Api.Irs.SimulateLevelsResult | null>(null);
const levelsError = ref('');

/**
 * 顶栏固定槽位「行情新鲜度」（2026-11-15）：只读 GET /irs/risk-board 的
 * stale_days / data_as_of（期权行情快照日），看板未就绪也占住位置显示「—」。
 * 分档与文案复用 risk-board/utils 的 staleLevel / staleLabel，不另写一套。
 */
const staleText = computed(() => (board.value ? staleLabel(board.value.stale_days, board.value.data_as_of) : '—'));
const staleType = computed<'default' | 'success' | 'warning' | 'error'>(() => {
  if (!board.value) return 'default';
  switch (staleLevel(board.value.stale_days)) {
    case 'ok':
      return 'success';
    case 'warn':
      return 'warning';
    default:
      return 'error';
  }
});

/**
 * 顶栏「提示」告警（2026-11-16）：风险看板 ctx 级 warnings（混日回退、T−1、
 * IV 反解失败、到期剔除等）常驻顶栏展示；无提示不占位。悬停列出全部条目。
 */
const boardWarnings = computed(() => board.value?.warnings ?? []);

/** FastAPI 错误体 detail 原样透出（409 行情阻断等） */
function detailOf(error: unknown): string {
  const e = error as { response?: { data?: { detail?: string } } };
  return e?.response?.data?.detail ?? '';
}

/**
 * GET /irs/risk-board：账户静态卡 / 风险预算 / 逐张合约静态列（IV、delta、最大亏损…）。
 * 旧 /irs/risk-board **页面**已下线，但接口保留：日终落库、账户静态卡都还需要它。
 * 预算 2026-11-16 起为档位锚定双防线（修正锚 = min(档位价, 现价)，旧 15% 压力档下线）。
 * detail=false：档位压力自带逐仓明细，不再需要旧的 11 档 grid detail。
 */
async function loadBoard() {
  const { data, error } = await fetchRiskBoard(
    { horizon: 'now', iv_mult: ivMult.value, detail: false },
    { silent: true }
  );
  if (error || !data) {
    boardError.value = detailOf(error) || '风险看板数据不可用';
    board.value = null;
    return;
  }
  boardError.value = '';
  board.value = data;
  if (query.account !== 'ALL' && !data.accounts[query.account]) query.account = 'ALL';
}

/** POST /irs/simulate/levels：五档档位压力，一次算完（纯现算、不落库） */
async function loadLevels() {
  const { data, error } = await simulateLevels({ horizon: 'now', iv_mult: ivMult.value });
  if (error || !data) {
    levelsError.value = detailOf(error) || '档位压力计算失败';
    levels.value = null;
    return;
  }
  levelsError.value = '';
  levels.value = data;
}

async function runSim() {
  // 显式调用（首屏 / 行情更新后）时撤掉 watch 排队的同一次请求，避免 400ms 内打两遍
  window.clearTimeout(debounceTimer);
  const seq = (simSeq += 1);
  simLoading.value = true;
  simError.value = '';
  try {
    const { data, error } = await simulateIrs({
      overrides: Object.fromEntries(overrides),
      // 主时点固定即期（2026-11-12 取消「即期 / 到期」切换，与标的五档风险指标一致）；
      // 逐仓 / 分账户两列 Δ 盈亏仍并列，到期列只作终局对照，不作为组合摘要口径。
      horizon: 'now',
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

/**
 * 三路刷新合并成一个 debounce（2026-11-13 两张总表整合后）：
 * - 只改假设价 → 只重算 /irs/simulate，静态卡与五档压力不变；
 * - IV 变化 → 三路一起重算，refreshing 期间不渲染两张总表，
 *   避免「新 IV 的到档值 + 旧 IV 的静态列」在同一行并排错配。
 */
const refreshing = ref(false);
watch([() => Array.from(overrides.entries()), ivMult], (cur, prev) => {
  window.clearTimeout(debounceTimer);
  const ivChanged = Boolean(prev && cur[1] !== prev[1]);
  debounceTimer = window.setTimeout(() => {
    if (ivChanged) {
      refreshing.value = true;
      void Promise.all([loadBoard(), loadLevels(), runSim()]).finally(() => {
        refreshing.value = false;
      });
    } else {
      void runSim();
    }
  }, 400);
});

onUnmounted(() => {
  window.clearTimeout(debounceTimer);
});

onMounted(() => {
  void load();
  void loadBoard();
  void loadLevels();
  // 首次立即算一次 0% 基准（与风险看板、档位压力表对照）
  void runSim();
});

/**
 * 两处行情更新（标的 / 持仓）的公共收尾：三路并发重算 —— 风险看板、五档压力、当前推演，
 * 全部就绪后再刷新两张总表，避免半新半旧（净值变了但压力表还是旧保证金）。
 */
async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([loadBoard(), loadLevels(), runSim()]);
  } finally {
    refreshing.value = false;
  }
}

/**
 * 顶栏「标的行情」：与 `/irs/underlying-monitors` 列表页「行情」按钮同一个接口
 * syncIrs('underlying-monitor')（gm current → 写 um.price → flush 触发 pv_* 钩子），
 * 反馈 / 防重复点击 / 状态分流全部复用 executeSync（含 no_data、error 不刷新的语义）。
 * 成功后重拉 GET /irs/today 拿新现价与五档，再重算推演；当前若停在某个批量档位，
 * 按新档位价重新套用一次，避免「新价配旧假设」。
 */
const quoteLoading = ref(false);

async function handleSyncQuote() {
  await executeSync(
    () => syncIrs('underlying-monitor'),
    quoteLoading,
    async () => {
      await load();
      if (activeBatch.value && activeBatch.value !== 'price') applyBatch(activeBatch.value);
      // 行情变了 ⇒ 现价与五档价都可能变，三路并发重算且全部就绪后才刷新两张总表
      await refreshAll();
    }
  );
}

/**
 * 顶栏「持仓行情更新」：与 `/bills/group-accs` 列表页「行情」按钮同一个接口 syncGroup
 * （POST /bills/sync/group = 实时估值 → 标的汇总 → 账户汇总 → 风险网格），
 * 改的是持仓市值 / 账面浮盈与网格，不动标的监测价（um.price）。
 * 故成功后只重算三路，不重拉 /irs/today、也不重套批量档位（档位价没变）。
 */
const holdingLoading = ref(false);

async function handleSyncHolding() {
  await executeSync(syncGroup, holdingLoading, refreshAll);
}

/** 当前假设档位名：两张总表到档组的表头注记（点压力表 → applyBatch → runSim 后自动跟上） */
const contractLevelLabel = computed(() => {
  if (activeBatch.value === null) return changedCount.value ? '自定义组合' : '现价';
  if (activeBatch.value === 'price') return '现价';
  return levels.value?.level_labels[BATCH_TO_LEVEL[activeBatch.value]] ?? '现价';
});

/** ① 账户总表分节栏的「当前档位」：跟随压力表选中行（手动改价自动回现价，2026-11-16 用户定稿） */
const activeLevelLabel = computed(() => {
  if (activeLevel.value === 'base') return '现价';
  return levels.value?.level_labels[activeLevel.value] ?? activeLevel.value;
});

function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** 摘要卡 / 改价小结 / 滑块读数用紧凑格式（0 位小数）；表格一律走 utils 标准格式（2 位小数） */
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

/** 表格数字格式与列头口径已下沉到两张总表组件；本页摘要卡 / 改价小结仍用本地紧凑格式 */
/** 假设价读数（档位条下方）：假设 X（±pct%）· 落入 zone_at */
function hypoText(it: SubjectRow) {
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

/**
 * 左栏卡片排序唯一数据源：后端 `subject_exposure` = 各标的项下持仓「风险敞口」之和
 * （按 账户+合约 去重、NULL 不计入，静态人工值、不随假设价变化）。
 * ③ 逐仓总表在组件内读同一份 result.subject_exposure 做同标的聚拢，两侧口径不会漂移。
 */
const subjectExposure = computed<Record<string, number>>(() => result.value?.subject_exposure ?? {});

function exposureOfSubject(sym: string | null | undefined) {
  return sym ? (subjectExposure.value[sym] ?? 0) : 0;
}

/**
 * 左栏标的卡片：按标的项下持仓敞口合计倒序；同值按代码升序兜底（稳定）。
 * 推演结果未到达时保持 /irs/today 的原优先级顺序，不额外按代码重排、避免首屏跳变。
 */
const sortedItems = computed(() => {
  if (!Object.keys(subjectExposure.value).length) return items.value;
  return [...items.value].sort(
    (a, b) => exposureOfSubject(b.symbol) - exposureOfSubject(a.symbol) || a.symbol.localeCompare(b.symbol)
  );
});
</script>

<template>
  <div class="h-full flex flex-col gap-12px p-16px">
    <!-- 顶栏：IV / 标的行情 + 持仓行情更新；档位选择只在 ② 压力表，时点口径固定即期，已无切换控件 -->
    <div class="flex flex-wrap items-center gap-12px">
      <span class="text-16px font-600">风险总览</span>
      <NTag size="small" :bordered="false" round>
        {{ changedCount ? `${changedCount} 个标的已改动` : '全部现价（0% 基准）' }}
      </NTag>
      <!-- 行情新鲜度常驻顶栏：直接取风险看板静态数据，推演未就绪 / 失败也照常显示 -->
      <NTooltip trigger="hover">
        <template #trigger>
          <NTag size="small" :bordered="false" round :type="staleType">行情新鲜度 {{ staleText }}</NTag>
        </template>
        <div v-if="board">
          <div>
            期权行情快照日 {{ board.data_as_of ?? '—' }} · 计算日 {{ board.calc_date }} · 引擎 {{ board.engine_ver }}
          </div>
          <div>0 = 当日，T−1 = 滞后 1 个交易日；滞后请点「标的行情」同步后再看压力推演。</div>
        </div>
        <div v-else>风险看板数据加载中…</div>
      </NTooltip>
      <!-- ctx 级告警（混日回退 / T−1 / IV 反解失败 / 到期剔除）：有条目才显示，悬停看全量 -->
      <NTooltip v-if="boardWarnings.length" trigger="hover" placement="bottom-start" class="max-w-420px">
        <template #trigger>
          <NTag size="small" :bordered="false" round type="warning">提示 {{ boardWarnings.length }}</NTag>
        </template>
        <ul class="m-0 list-disc pl-16px text-12px leading-relaxed">
          <li v-for="(w, i) in boardWarnings" :key="i">{{ w }}</li>
        </ul>
      </NTooltip>
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
      <!-- 右侧只留行情相关操作；档位选择统一交给 ② 压力表，避免同一动作两个入口 -->
      <div class="ml-auto flex items-center gap-6px">
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="tiny" :loading="quoteLoading" :disabled="holdingLoading" @click="handleSyncQuote">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              标的行情
            </NButton>
          </template>
          同步标的监测价（与标的监测列表页「行情」按钮同接口），成功后刷新现价 / 五档并重算推演。
        </NTooltip>
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="tiny" :loading="holdingLoading" :disabled="quoteLoading" @click="handleSyncHolding">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              持仓行情更新
            </NButton>
          </template>
          重算持仓实时估值与账户汇总（与 /bills/group-accs 列表页「行情」按钮同接口）， 成功后刷新净值 /
          浮盈并重算推演；不动标的监测价。
        </NTooltip>
        <NButton size="tiny" @click="load">
          <template #icon><SvgIcon icon="mdi:refresh" /></template>
          刷新标的
        </NButton>
      </div>
    </div>

    <!-- 左右两栏 -->
    <div class="min-h-0 flex flex-1 gap-12px">
      <!-- 左栏：标的卡片（档位条即滑块；无五档版本才退回独立 NSlider；按敞口倒序） -->
      <!-- 2026-11-16 起可收起成 24px 窄条（showLeft），右栏自动占满；批量套档不受影响 -->
      <div v-if="showLeft" class="w-380px flex-none overflow-y-auto pr-4px">
        <div class="mb-8px flex items-center justify-between">
          <span class="text-11px text-gray-400">按标的项下持仓风险敞口合计倒序</span>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton size="tiny" text @click="showLeft = false">
                <template #icon><SvgIcon icon="mdi:chevron-double-left" /></template>
              </NButton>
            </template>
            收起标的卡片栏
          </NTooltip>
        </div>
        <NEmpty v-if="!items.length && !loading" description="还没有标的监测标的" class="mt-24px" />
        <div class="flex flex-col gap-12px">
          <SubjectCard
            v-for="it in sortedItems"
            :key="it.symbol"
            :subject="it"
            :hypo-price="overrides.get(it.symbol) ?? null"
            :changed="overrides.has(it.symbol)"
            @detail="goDetail(it)"
            @pick="(v: number) => setHypo(it, v)"
          >
            <template #footer="{ tiers }">
              <!-- 无五档版本：保留独立 NSlider，否则这类标的完全无法设假设价 -->
              <NSlider
                v-if="!tiers"
                :value="overrides.get(it.symbol) ?? it.price ?? 0"
                :min="axisOf(it)?.lo"
                :max="axisOf(it)?.hi"
                :step="stepOf(axisOf(it))"
                :tooltip-formatter="(v: number) => fmtPrice(v)"
                :disabled="!it.price"
                @update:value="(v: number) => setHypo(it, v)"
              />
              <!-- 读数行常驻：取代旧的分隔线 + 滑块 + marks 三行，卡片整体更紧凑 -->
              <div class="flex items-center justify-between text-12px" :class="tiers ? '' : 'mt-6px'">
                <span :class="overrides.has(it.symbol) ? 'text-green-500' : 'text-gray-400'">
                  假设 {{ hypoText(it).main }}{{ hypoText(it).zone }}
                </span>
                <NButton v-if="overrides.has(it.symbol)" size="tiny" text @click="resetHypo(it)">回现价</NButton>
              </div>
            </template>
          </SubjectCard>
        </div>
      </div>

      <!-- 左栏收起态：24px 窄条只留展开按钮（批量套档在 ② 压力表，不需要左栏也能改价） -->
      <div v-else class="flex w-24px flex-none flex-col items-center justify-center">
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton size="tiny" text @click="showLeft = true">
              <template #icon><SvgIcon icon="mdi:chevron-double-right" /></template>
            </NButton>
          </template>
          展开标的卡片栏
        </NTooltip>
      </div>

      <!-- 右栏：② 档位压力表 → ① 账户总表 → ③ 逐仓总表 → ④ 推演区（⓪ 组合快照 2026-11-15 整节删除） -->
      <div class="min-w-0 flex-1 overflow-y-auto">
        <!--
          ② 档位压力表（2026-11-15 上移到右栏最前）：
          它是档位选择的唯一入口，先选档再看下面两张总表，操作路径更顺。
          五档 + 现价基准，点击整行批量套用左栏滑块；套用遵循修正锚（已越过档位的
          标的保持现价，与后端 _level_overrides 同口径）⇒ 推演结果 = 压力表该行数值。
          分节栏标签 2026-11-16 起显示**账户视角**（跟随 ① 账户总表选中行）。
          编号 ①② 是分节代号、不随位置变。
        -->
        <SectionBar title="档位压力表（全标的同步到同一档）">
          <NTag size="tiny" :bordered="false" type="info">
            账户视角 {{ query.account === 'ALL' ? '组合' : query.account }}
          </NTag>
          <span class="text-12px text-gray-400">
            点击整行切换档位 · 引擎 {{ levels?.engine_ver ?? '—' }} · {{ levels?.as_of || '—' }}
          </span>
          <template #actions>
            <span v-if="activeBatch === null && changedCount" class="text-12px text-orange-500">
              左栏为自定义组合，与预设档位不同步
            </span>
          </template>
        </SectionBar>
        <NAlert v-if="levelsError" type="warning" :title="levelsError" class="mb-16px" />
        <LevelPressureTable
          v-else-if="board && levels"
          :levels="levels"
          :account="query.account"
          :active-level="activeLevel"
          class="mb-16px"
          @select="onSelectLevel"
        />
        <NEmpty v-else description="档位压力计算中…" class="mb-16px" />

        <!-- ① 账户总表：13 列平铺一级表头；点击行切换视角，联动 ② ③ -->
        <SectionBar title="账户总表（点击行切换视角，空账户不列）">
          <NTag size="tiny" :bordered="false" type="info">当前档位 {{ activeLevelLabel }}</NTag>
          <span class="text-12px text-gray-400">静态列不随滑块变 · 到档列跟随左栏假设价</span>
          <!-- 列平铺后原分组父列消失，其「到档口径」说明改由分节栏问号承载 -->
          <NTooltip trigger="hover" style="max-width: 420px">
            <template #trigger>
              <span class="text-12px text-gray-400" style="cursor: help">到档口径说明 ?</span>
            </template>
            <div style="line-height: 1.6">
              <div v-for="(line, i) in ACCOUNT_AT_NOTES" :key="i">{{ line }}</div>
            </div>
          </NTooltip>
          <template #actions>
            <NButton text type="primary" size="tiny" @click="router.push({ name: 'bills_group-accs' })">
              账户汇总
            </NButton>
          </template>
        </SectionBar>
        <NAlert v-if="boardError" type="warning" :title="boardError" class="mb-16px" />
        <AccountRiskList
          v-else-if="board && result && !refreshing"
          :board="board"
          :account="query.account"
          :sim="result"
          class="mb-16px"
          @select="selectAccount"
        />
        <NEmpty v-else description="账户总表数据准备中…" class="mb-16px" />

        <!-- ③ 逐仓总表：与 ①② 一样用 SectionBar 分节、不套卡片；静态组 board.positions + 到档组 sim.position_rows -->
        <SectionBar title="逐仓总表（按标的敞口聚拢，改价行高亮）">
          <NTag size="tiny" :bordered="false" type="info">当前假设 {{ contractLevelLabel }}</NTag>
          <span class="text-12px text-gray-400">静态组不随滑块变 · 到档组跟随左栏假设价 · 点击合约名跳期权行情</span>
          <template #actions>
            <NButton text type="primary" size="tiny" @click="router.push({ name: 'bills_group-symbols' })">
              持仓汇总
            </NButton>
          </template>
        </SectionBar>
        <ContractTable
          v-if="board && result && !refreshing"
          :board="board"
          :account="query.account"
          :sim="result"
          :level-label="contractLevelLabel"
          class="mb-16px"
        />
        <NEmpty v-else description="逐仓总表数据准备中…" class="mb-16px" />

        <!-- ④ 推演区（保证金结构 / 组合推演 / 改价小结）；⓪ 组合快照 2026-11-15 已整节删除 -->
        <NEmpty v-if="simError" :description="simError" class="mt-24px" />
        <template v-else-if="result">
          <SectionBar title="保证金结构（现价基准）">
            <NTag size="tiny" :bordered="false">现价 + 五档</NTag>
            <span class="text-12px text-gray-400">x 轴 = 现价 + 五档，按品种族堆叠</span>
          </SectionBar>
          <MarginStackChart v-if="board && levels" :board="board" mode="sync" :levels="levels" class="mb-16px" />

          <!-- 组合推演：与档位 Tab 一样，SectionBar 直接分节、不套卡片 -->
          <SectionBar title="组合推演">
            <NTag size="tiny" :bordered="false" round>主时点 即期</NTag>
            <NTag size="tiny" :bordered="false">IV ×{{ result.iv_mult.toFixed(2) }}</NTag>
            <span class="text-12px text-gray-400">
              引擎 {{ result.engine_ver }} · {{ result.as_of || '—' }}
              <template v-if="result.stale_days != null && result.stale_days > 0">
                ·
                <span class="text-orange-500">行情滞后 {{ result.stale_days }} 个交易日</span>
              </template>
            </span>
            <template #actions>
              <span v-if="simLoading" class="text-12px text-gray-400">计算中…</span>
            </template>
          </SectionBar>
          <div class="mb-16px flex flex-wrap gap-12px text-12px">
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
              预算（现价基准·档位锚定）
              <NTag
                size="tiny"
                :bordered="false"
                :type="
                  result.budget.summary.verdict === 'ok'
                    ? 'success'
                    : result.budget.summary.verdict === 'breach'
                      ? 'error'
                      : 'warning'
                "
              >
                {{ result.budget.summary.verdict }}
              </NTag>
              <span v-for="(key, i) in ['r', 'e'] as const" :key="key" :class="i > 0 ? 'ml-8px' : 'ml-4px'">
                <span class="text-gray-400">{{ key === 'r' ? '低R' : '极低E' }}</span>
                <template v-if="(result.budget.summary.lines[key]?.gap ?? 0) > 0">
                  <b class="text-red-500">缺 {{ fmtMoneyShort(result.budget.summary.lines[key]?.gap ?? 0) }}</b>
                  <span class="text-gray-400">
                    （入金 {{ fmtMoneyShort(result.budget.summary.lines[key]?.fund_needed ?? 0) }}）
                  </span>
                </template>
                <b v-else class="text-green-500">余 {{ fmtMoneyShort(result.budget.summary.lines[key]?.left ?? 0) }}</b>
              </span>
            </span>
            <NTag
              v-if="result.budget.summary.breached_accounts.length"
              size="tiny"
              :bordered="false"
              type="error"
              round
            >
              破线：{{ result.budget.summary.breached_accounts.join(' / ') }}
            </NTag>
          </div>

          <!-- 改价标的假设态小结 -->
          <template v-if="changedCount">
            <SectionBar :title="`改价标的假设态（${changedCount}）`">
              <span class="text-12px text-gray-400">按主时点即期口径；Σ即期Δ盈亏 = 组合 Δ盈亏，可对账</span>
            </SectionBar>
            <div class="mb-16px flex flex-col gap-8px">
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
          </template>

          <!-- 逐仓明细 / 分账户风险指标已并入 ③ 逐仓总表 / ① 账户总表，此处不再重复出表 -->
          <!-- 口径说明（预留分节，同样不套卡片） -->
          <!--
 <div>
            <div class="text-12px text-gray-400">口径与告警（{{ result.warnings.length }} 条）</div>
            <ul class="mt-4px list-disc pl-18px text-11px text-gray-400 leading-relaxed">
              <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              <li>预算读数为现价基准（0% 与中/低档到档情景、修正锚 = min(档位价, 现价)），不随滑块假设价变化；组合行 = 全组合口径（账户资金可互调）。</li>
            </ul>
          </div> 
-->
        </template>
        <NEmpty v-else description="拖动左栏档位条开始推演" class="mt-48px" />
      </div>
    </div>

    <!-- 档案抽屉 + 编辑抽屉：都复用 /irs/underlying-monitors 的组件，页内弹出、不跳页 -->
    <DetailDrawer
      ref="detailDrawerRef"
      v-model:show="showDrawer"
      :row="drawerRow"
      @edit="onDrawerEdit"
      @changed="onDrawerChanged"
    />
    <!-- 看板页不放删除入口；保存后由 onEditChanged 重拉清单并三路重算 -->
    <EditDrawer v-model:show="showEdit" :row="editRow" :allow-delete="false" @changed="onEditChanged" />
  </div>
</template>

<style scoped>
/*
 * 两张总表的 :deep() nowrap / 列宽与 scroll-x / 分组表头样式全部在各自组件内维护（🔒4.7/4.11）。
 * 本页右侧各区块不套 NCard：SectionBar 自带 margin 12px 0 8px + 灰底左色条即为唯一分隔，
 * 底色 / 左色条 / 字号 / 明暗主题适配全由 SectionBar 决定，不另写卡片样式（防样式漂移）。
 */
</style>
