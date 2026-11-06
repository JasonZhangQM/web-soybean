import { request } from '../request';

/** 标的监测（UnderlyingMonitor 独立表）查询参数 */
interface UnderlyingMonitorsQueryParams {
  /** 代码（精确匹配） */
  symbol?: string;
  /** 主题（多选精确匹配，主题只在标的层维护） */
  theme?: string[];
  /** 研究状态：none=还没做过研究；due=最新一版研究的复核已到期 */
  research_state?: 'none' | 'due';
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询标的监测列表（UnderlyingMonitor 独立表，含 v3 派生字段） */
export function fetchUnderlyingMonitors(params?: UnderlyingMonitorsQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.UnderlyingMonitor>>({
    url: '/api/v1/irs/underlying-monitors',
    method: 'get',
    params
  });
}

/** 标的监测新增参数（v3 起 pp_* 可选，档位版本去详情抽屉的「档位」Tab 建） */
interface UnderlyingMonitorCreateParams {
  /** 代码 */
  symbol: string;
  /** 名称 */
  name: string;
  /** 主题 */
  theme?: string | null;
}

/** 新增标的监测记录 */
export function createUnderlyingMonitor(params: UnderlyingMonitorCreateParams) {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/underlying-monitors',
    method: 'post',
    data: params
  });
}

/**
 * 标的监测修改参数（symbol 业务主键，API 禁改）
 *
 * v3 起 `pp_*` 不直写主表：转发 save_version()（版本表 upsert + 回写主表）。
 * 五档传 null/不传 = 不改档位（只改名/主题时不必带）。
 */
interface UnderlyingMonitorUpdateParams {
  /** 名称 */
  name: string;
  /** 极低 */
  pp_el?: number | null;
  /** 低 */
  pp_l?: number | null;
  /** 中 */
  pp_m?: number | null;
  /** 高 */
  pp_h?: number | null;
  /** 极高 */
  pp_eh?: number | null;
  /** 主题 */
  theme?: string | null;
  /** 档位版本生效日（空 = 今天）：选新日期=新建一版，选历史日期=改那一版 */
  effective_date?: string | null;
  /** 上年末（可选，不传表示不修改） */
  py_close?: number | null;
  /** 年高（可选，不传表示不修改） */
  y_high?: number | null;
  /** 年低（可选，不传表示不修改） */
  y_low?: number | null;
  /** 最新价（可选，不传表示不修改） */
  price?: number | null;
}

/** 修改标的监测记录 */
export function updateUnderlyingMonitor(id: number, params: UnderlyingMonitorUpdateParams) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/underlying-monitors/${id}`,
    method: 'put',
    data: params
  });
}

/**
 * 删除标的监测记录
 *
 * 外键是 RESTRICT：有子数据时返回 **409 + 各子表计数**（让「删标的」先看代价）。
 * `cascade=true` 才按序删子表再删主表（不删成交笔记——它挂 bill_id，与标的无关）。
 */
export function deleteUnderlyingMonitor(id: number, cascade = false) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/underlying-monitors/${id}`,
    method: 'delete',
    params: cascade ? { cascade: true } : undefined
  });
}

// =========================================================================
// v3：标的档案（档位版本 / 研究定稿 / 计划委托 / 逻辑 / 证伪）
// =========================================================================

/** 详情抽屉首屏（一次给全，避免开抽屉连打 5 个请求） */
/**
 * 2026-10-30 瘦身版：只返回概览 Tab 最小集。
 * 各 Tab 数据改为切到时懒加载（versions/research/logic/invalidate/plans/trades/groups）。
 */
export interface UnderlyingMonitorDetail {
  um: Api.Irs.UnderlyingMonitor;
  /** 当前生效版（只有日期 + 备注，五档见 versions Tab 懒加载） */
  current_version: { effective_date: string; note: string | null } | null;
  /** 剧本前 10 条（概览只读展示） */
  plans_preview: Api.Irs.UnderlyingPlan[];
  /** 最新一版研究（概览决策卡） */
  latest_research: Api.Irs.UnderlyingResearch | null;
  /** 轻量计数（概览只关心"有多少"） */
  plans_active_count: number;
  plans_total_count: number;
  logic_total_count: number;
  invalidate_total_count: number;
  group_rows: number;
  bill_rows: number;
}

/** 归属合约行（对应交易代码） */
export interface UnderlyingGroup {
  id: number;
  category: string;
  symbol: string;
  count: number | null;
  pf_total: number | null;
  bill_rows: number | null;
  /** 持仓量 */
  p_total: number | null;
  /** 持仓成本 */
  cost_total: number | null;
  /** 最新价 */
  price: number | null;
  /** 乘数 */
  multiplier: number | null;
  /** 当前市值 */
  value_total: number | null;
  /** 平仓盈亏 */
  pl_all: number | null;
  /** 盈亏合计 */
  pfl_all: number | null;
}

/** 标的页成交行（一行 = 一笔成交，笔记已压成两列） */
export interface UnderlyingTrade {
  id: number;
  trade_time: string;
  account: string;
  category: string;
  symbol: string;
  name: string;
  /** 买/卖 */
  b_s: string | null;
  /** 沽/购（期权专有，证券/期货为 null） */
  c_p: string | null;
  /** 开/平 */
  o_c: string | null;
  price: number;
  vol: number;
  amount: number;
  /** 发生额（含费用的实际资金变动） */
  amount_act: number | null;
  /** 余额（成交后账户余额） */
  balance: number | null;
  underlying_symbol: string;
  note_idea: string | null;
  note_idea_at: string | null;
  /** 该想法关联的剧本 irs_um_plan.id（未关联为 null） */
  plan_id: number | null;
}

/** 复盘（标的层，锚定一版研究 irs_um_research；review_date 由后端填） */
export interface UnderlyingReview {
  id: number;
  symbol: string;
  /** 锚定的研究版本 irs_um_research.id */
  research_id: number;
  content: string;
  /** 落笔日期（后端填，前端不可传） */
  review_date: string;
  create_time: string;
  update_time: string;
}

/** 查询标的详情（主表 + 当前档位 + 研究 + 计划 + 归属合约 + 成交） */
export function fetchUnderlyingMonitorDetail(id: number) {
  return request<UnderlyingMonitorDetail>({
    url: `/api/v1/irs/underlying-monitors/${id}/detail`,
    method: 'get'
  });
}

/** 分页查询标的的对应交易代码（id 倒序；分类精确、合约模糊） */
export function fetchUnderlyingGroups(
  id: number,
  opts: { page?: number; pageSize?: number; category?: string | null; symbol?: string | null } = {}
) {
  return request<{ items: UnderlyingGroup[]; total: number; page: number; page_size: number }>({
    url: `/api/v1/irs/underlying-monitors/${id}/groups`,
    method: 'get',
    params: {
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 10,
      category: opts.category ?? undefined,
      symbol: opts.symbol ?? undefined
    }
  });
}

/** 分页查询标的成交（含「想法」笔记与关联剧本；融资融券不在其中） */
export function fetchUnderlyingMonitorTrades(
  id: number,
  opts: {
    page?: number;
    pageSize?: number;
    planId?: number | null;
    account?: string | null;
    symbol?: string | null;
    category?: string | null;
  } = {}
) {
  return request<{ items: UnderlyingTrade[]; total: number; page: number; page_size: number }>({
    url: `/api/v1/irs/underlying-monitors/${id}/trades`,
    method: 'get',
    params: {
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 20,
      plan_id: opts.planId ?? undefined,
      account: opts.account ?? undefined,
      symbol: opts.symbol ?? undefined,
      category: opts.category ?? undefined
    }
  });
}

/** 归属覆盖率（每个标的的合约行数与成交笔数，融资融券不计） */
export function fetchUnderlyingCoverage() {
  return request<{ items: Api.Irs.UnderlyingCoverageRow[]; total_bills: number }>({
    url: '/api/v1/irs/underlying-monitors/coverage',
    method: 'get'
  });
}

/** 未归属的合约行（排除资金流水行与同代码自动命中，即可操作清单） */
export function fetchUnderlyingUnmapped(limit = 300) {
  return request<{ items: Api.Irs.UnderlyingUnmappedRow[]; count: Record<string, number> }>({
    url: '/api/v1/irs/underlying-monitors/unmapped',
    method: 'get',
    params: { limit }
  });
}

// ---------------------------------------------------------------- 档位版本
/** 查询该标的全部档位版本（日期倒序，带现算 pv_* / status / diff） */
export function fetchUnderlyingVersions(id: number) {
  return request<Api.Irs.UnderlyingVersion[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/versions`,
    method: 'get'
  });
}

/** 档位版本保存参数 */
export interface UnderlyingVersionSaveParams {
  symbol: string;
  /** 生效日；空 = 今天。选新日期=新建，选历史日期=改那一版 */
  effective_date?: string | null;
  pp_el: number;
  pp_l: number;
  pp_m: number;
  pp_h: number;
  pp_eh: number;
  note?: string | null;
}

/**
 * 保存档位版本（**五档的唯一写入口**：版本 upsert + 回写主表 pp_* → 钩子重算 pv_*）
 *
 * 返回 action=created|updated|unchanged，前端据此提示「将新建 X 日 / 将覆盖 X 日」。
 */
export function saveUnderlyingVersion(id: number, params: UnderlyingVersionSaveParams) {
  return request<{
    status: string;
    action: 'created' | 'updated' | 'unchanged';
    effective_date: string;
    /** 档位分位校验告警（P2-4：level/pb_pct/message） */
    warnings?: Array<{ level: string; pb_pct: number; message: string }>;
  }>({
    url: `/api/v1/irs/underlying-monitors/${id}/versions`,
    method: 'post',
    data: params
  });
}

/** 删除某一版档位（删完主表按剩余版本回写） */
export function deleteUnderlyingVersion(id: number, versionId: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/underlying-monitors/${id}/versions/${versionId}`,
    method: 'delete'
  });
}

// ---------------------------------------------------------------- 研究定稿
/** 查询该标的全部研究定稿（日期倒序） */
export function fetchUnderlyingResearch(id: number) {
  return request<Api.Irs.UnderlyingResearch[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/research`,
    method: 'get'
  });
}

/** 研究保存参数（按 (symbol, research_date) upsert，未传字段保持不变） */
export interface UnderlyingResearchSaveParams {
  research_date: string;
  thesis?: string | null;
  conclusion?: string | null;
  max_risk?: string | null;
  expectation_gap?: string | null;
  pre_condition?: string | null;
  next_review?: string | null;
  research_note?: string | null;
  research_brief?: string | null;
  research_log?: string | null;
}

/**
 * 保存一版研究（选新日期=新建，选历史日期=改那一版；前端须二次确认"将改写 X 日"）
 *
 * 文本长度上限（后端校验）：thesis / max_risk / pre_condition ≤200，
 * research_brief ≤800，research_log ≤2000。报告正文留在知识库，系统只存决策摘要。
 */
export function saveUnderlyingResearch(id: number, params: UnderlyingResearchSaveParams) {
  return request<{ status: string; action: string; research_date: string }>({
    url: `/api/v1/irs/underlying-monitors/${id}/research`,
    method: 'put',
    data: params
  });
}

/** 删除某一版研究（按日期定位，不是按 id） */
export function deleteUnderlyingResearch(id: number, researchDate: string) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/underlying-monitors/${id}/research`,
    method: 'delete',
    params: { research_date: researchDate }
  });
}

// ---------------------------------------------------------------- 复盘（锚定研究版本）
/** 查询该标的全部复盘（review_date 倒序） */
export function fetchUnderlyingReviews(id: number) {
  return request<UnderlyingReview[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/reviews`,
    method: 'get'
  });
}

/** 复盘保存参数（review_date 由后端填，前端不可传） */
export interface UnderlyingReviewSaveParams {
  /** 锚定的研究版本 irs_um_research.id */
  research_id: number;
  content: string;
}

/** 新建一条复盘（同一研究版本可多次复盘） */
export function createUnderlyingReview(id: number, params: UnderlyingReviewSaveParams) {
  return request<UnderlyingReview>({
    url: `/api/v1/irs/underlying-monitors/${id}/reviews`,
    method: 'post',
    data: params
  });
}

/** 改写一条复盘（锚定的研究版本可换） */
export function updateUnderlyingReview(reviewId: number, params: UnderlyingReviewSaveParams) {
  return request<UnderlyingReview>({
    url: `/api/v1/irs/reviews/${reviewId}`,
    method: 'put',
    data: params
  });
}

/** 删除一条复盘 */
export function deleteUnderlyingReview(reviewId: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/reviews/${reviewId}`,
    method: 'delete'
  });
}

// ---------------------------------------------------------------- 计划委托
/** 查询该标的的计划委托（含派生状态与有效触发价） */
export function fetchUnderlyingPlans(id: number) {
  return request<Api.Irs.UnderlyingPlan[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/plans`,
    method: 'get'
  });
}

/** 剧本保存参数（按 seq upsert，同标的同 seq 覆盖） */
export interface UnderlyingPlanSaveParams {
  seq: number;
  /** 实际下单合约代码（真实代码，不是"沪深300"这种） */
  trade_symbol: string;
  b_s: string;
  o_c?: string | null;
  trigger_op?: string;
  /** 显式触发价；留空则回落到 trigger_ref 的当前档位值 */
  trigger_price?: number | null;
  /** 引用档位字段：pp_el / pp_l / pp_m / pp_h / pp_eh */
  trigger_ref?: string | null;
  trigger_price2?: number | null;
  /** 每次执行手数（空=到价再定量） */
  qty?: number | null;
  reason?: string | null;
  is_cancelled?: boolean;
}

/** 保存一条计划（有效触发价 = trigger_price ?? 当前档位值，档位改版后计划自动跟随） */
export function saveUnderlyingPlan(id: number, params: UnderlyingPlanSaveParams) {
  return request<{ status: string; action: string; seq: number }>({
    url: `/api/v1/irs/underlying-monitors/${id}/plans`,
    method: 'put',
    data: params
  });
}

/** 轻量刷新：只拉当前标的剧本（不含详情抽屉的 10 合 1 大接口开销） */
export function fetchUnderlyingMonitorPlans(id: number) {
  return request<Api.Irs.UnderlyingPlan[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/plans`,
    method: 'get'
  });
}

/** 删除一条计划（按 seq） */
export function deleteUnderlyingPlan(id: number, seq: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/underlying-monitors/${id}/plans/${seq}`,
    method: 'delete'
  });
}

/** 无计划成交（成交早于该标的任何计划的建立时间——纪律的唯一可算证据） */
export function fetchUnderlyingUnplanned(id: number) {
  return request<{ items: UnderlyingTrade[]; count: number }>({
    url: `/api/v1/irs/underlying-monitors/${id}/unplanned`,
    method: 'get'
  });
}

// ---------------------------------------------------------------- 逻辑 / 证伪
/** 查询投资逻辑清单 */
export function fetchUnderlyingLogic(id: number) {
  return request<Api.Irs.UnderlyingLogic[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/logic`,
    method: 'get'
  });
}

/** 逻辑保存参数（按 seq upsert；state 变化时才写 state_at） */
export interface UnderlyingLogicSaveParams {
  seq: number;
  content: string;
  pricing?: string | null;
  /** 完好 / 减弱 / 破坏（与后端 STATE_CHOICES 一致；曾经写成「受损」会导致按 state 聚合漏数） */
  state?: string;
  evidence?: string | null;
}

/** 保存一条投资逻辑（⚠️ 全字段覆盖：行内只改 state 时必须回填 content/pricing/evidence） */
export function saveUnderlyingLogic(id: number, params: UnderlyingLogicSaveParams) {
  return request<{ status: string; action: string; id: number; warning: string | null }>({
    url: `/api/v1/irs/underlying-monitors/${id}/logic`,
    method: 'put',
    data: params
  });
}

/** 删除一条投资逻辑（后端会把引用它的证伪 logic_id 置 NULL，返回被摘掉引用的条数） */
export function deleteUnderlyingLogic(id: number, seq: number) {
  return request<{ status: string; message: string; unlinked_invalidates: number }>({
    url: `/api/v1/irs/underlying-monitors/${id}/logic/${seq}`,
    method: 'delete'
  });
}

/** 查询证伪条件清单（quantified=false 表示 signal 里没有数字阈值，应标红） */
export function fetchUnderlyingInvalidate(id: number) {
  return request<Api.Irs.UnderlyingInvalidate[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/invalidate`,
    method: 'get'
  });
}

/** 证伪条件保存参数（按 seq upsert；只登记，不自动计算触发） */
export interface UnderlyingInvalidateSaveParams {
  seq: number;
  proposition: string;
  /** 信号：必须可量化（出现「比较符+数字」或「数字%」），否则判为未填 */
  signal: string;
  logic_id?: number | null;
  source?: string | null;
  action?: string | null;
  /** 判定类别：price / percentile / discount / manual */
  judge?: string | null;
  /** 判据表达式（如 price<=3900、pe_pct>=0.8） */
  judge_expr?: string | null;
  status?: string;
  triggered_at?: string | null;
}

/** 保存一条证伪条件（不可量化不阻断，返回值带 quantified + warning） */
export function saveUnderlyingInvalidate(id: number, params: UnderlyingInvalidateSaveParams) {
  return request<{ status: string; action: string; id: number; quantified: boolean; warning: string | null }>({
    url: `/api/v1/irs/underlying-monitors/${id}/invalidate`,
    method: 'put',
    data: params
  });
}

/** 删除一条证伪条件（按 seq） */
export function deleteUnderlyingInvalidate(id: number, seq: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/underlying-monitors/${id}/invalidate/${seq}`,
    method: 'delete'
  });
}

// ---------------------------------------------------------------- 今日页 / 横切
/** 今日页单标的（GET /irs/today 返回裸数组，无 items 包裹） */
export function fetchToday() {
  return request<Api.Irs.TodayItem[]>({
    url: '/api/v1/irs/today',
    method: 'get'
  });
}

/** 全量计划（跨标的），供归因表 plan_id → 剧本名/标的映射 */
export function fetchAllPlans() {
  return request<Api.Irs.UnderlyingPlan[]>({
    url: '/api/v1/irs/plans',
    method: 'get'
  });
}

/** 某标的状态演化时间轴（逻辑 state + 证伪 status 的 append-only 日志） */
export function fetchUnderlyingStateLog(id: number) {
  return request<Api.Irs.UnderlyingStateLog[]>({
    url: `/api/v1/irs/underlying-monitors/${id}/state-log`,
    method: 'get'
  });
}

/** 全部标的的目标仓位（决策层） */
export function fetchUnderlyingTargets() {
  return request<Api.Irs.UnderlyingTarget[]>({
    url: '/api/v1/irs/targets',
    method: 'get'
  });
}

/** 保存目标仓位（按 symbol upsert，target_pct=null 表示未设定） */
export function saveUnderlyingTarget(symbol: string, targetPct: number | null, note?: string | null) {
  return request<{ status: string; action: string; id: number }>({
    url: '/api/v1/irs/targets',
    method: 'put',
    data: { symbol, target_pct: targetPct, note }
  });
}

/** 删除一个标的的目标仓位 */
export function deleteUnderlyingTarget(symbol: string) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/targets/${symbol}`,
    method: 'delete'
  });
}

/** 贴水监测查询参数 */
interface MonitorDiscountQueryParams {
  /** 合约类别（精确匹配） */
  symbol_type?: string;
  /** 连续合约名称（精确匹配） */
  con_name?: string;
  /** 是否主力（精确匹配） */
  is_main?: boolean;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询贴水监测列表 */
export function fetchMonitorDiscounts(params?: MonitorDiscountQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.DiscountMonitor>>({
    url: '/api/v1/irs/discounts-monitor',
    method: 'get',
    params
  });
}

/** 贴水监测下拉选项（合约类别 + 连续合约名称） */
interface DiscountOptionsResponse {
  /** 合约类别列表 */
  symbol_types: string[];
  /** 连续合约名称列表 */
  con_names: string[];
}

/** 获取贴水监测下拉选项（从 Config 配置取数，无数据库查询） */
export function fetchDiscountOptions() {
  return request<DiscountOptionsResponse>({
    url: '/api/v1/irs/discount-options',
    method: 'get'
  });
}

/** irs 同步目标类型 */
type IrsSyncTarget = 'discount-symbol' | 'discount-monitor' | 'underlying-monitor-hlc' | 'underlying-monitor';

/** 触发 irs 同步 */
export function syncIrs(target: IrsSyncTarget) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/sync/${target}`,
    method: 'post'
  });
}

/**
 * 刷新最新估值分位截面表（`irs_um_percentile`）
 *
 * 范围**固定**为 `/irs/underlying-monitors` 的标的，无入参；上游两张估值表都查不到的
 * 标的（SPX / GC00Y）由后端自动剔除并在结果里回报。返回任务对象，进度靠 `fetchSyncTask` 轮询。
 * ⚠️ 与批量同步共用全局任务锁，任意任务 running 时会返回 409。
 */
export function startUmPctLatestSync() {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/irs/sync/um-percentile',
    method: 'post',
    // 建任务后立即返回，实际执行在后台线程
    timeout: 30 * 1000
  });
}

/** 最新分位表只读状态（行数 / calc_at / 各标的 as_of 与 PE、PB 10 年分位） */
export function fetchUmPctLatestStats() {
  return request<Api.Irs.UmPctLatestStats>({
    url: '/api/v1/irs/um-percentile/stats',
    method: 'get'
  });
}

/** 单品种组的加仓额度读数 */
export interface UmBudgetScopeRow {
  scope: string;
  scope_name: string;
  /** false = 该品种组当前无保证金持仓（无法反推每手保证金） */
  found: boolean;
  account?: string;
  verdict?: string;
  /** 卡在哪个约束：品种组名 / total@now / total@stress */
  binding?: string;
  /** 取 min 后的可开额度（压力口径） */
  headroom?: number | null;
  gate_now?: number | null;
  gate_stress?: number | null;
  scope_headroom?: number | null;
  pct?: number | null;
  cap?: number | null;
  lots?: number;
  per_lot_margin?: number | null;
  note?: string;
}

/** 标的加仓可行性（GET /irs/um-budget） */
export interface UmBudget {
  symbol: string;
  scopes: UmBudgetScopeRow[];
  /** 最严的那一条（能不能加仓由它决定） */
  binding: { account: string; scope: string; headroom: number | null; verdict: string } | null;
  lots?: number;
  per_lot_margin?: number | null;
  /** block / over / ok / skip；null = 该标的无保证金品种组，不判 */
  verdict: string | null;
  as_of?: string | null;
  note: string;
}

/**
 * 标的是否还有加仓额度。额度唯一实现在后端（bills/services/budget.py），
 * 前端**不得**自己拼装——两次请求跨时点就是 10-23 那个错误的微缩版。
 */
export function fetchUmBudget(symbol: string, account?: string) {
  return request<UmBudget>({
    url: '/api/v1/irs/um-budget',
    method: 'get',
    params: { symbol, account: account || undefined }
  });
}
