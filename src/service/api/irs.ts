import { request } from '../request';

/** 估值监测（ValueMonitor 独立表）查询参数 */
interface ValueMonitorsQueryParams {
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

/** 查询估值监测列表（ValueMonitor 独立表，含 v3 派生字段） */
export function fetchValueMonitors(params?: ValueMonitorsQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.ValueMonitor>>({
    url: '/api/v1/irs/value-monitors',
    method: 'get',
    params
  });
}

/** 估值监测新增参数 */
interface ValueMonitorCreateParams {
  /** 代码 */
  symbol: string;
  /** 名称 */
  name: string;
  /** 极低 */
  pp_el: number;
  /** 低 */
  pp_l: number;
  /** 中 */
  pp_m: number;
  /** 高 */
  pp_h: number;
  /** 极高 */
  pp_eh: number;
  /** 主题 */
  theme?: string | null;
  /** 首版生效日（空 = 今天） */
  effective_date?: string | null;
}

/** 新增估值监测记录 */
export function createValueMonitor(params: ValueMonitorCreateParams) {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/value-monitors',
    method: 'post',
    data: params
  });
}

/**
 * 估值监测修改参数（symbol 业务主键，API 禁改）
 *
 * v3 起 `pp_*` 不直写主表：转发 save_version()（版本表 upsert + 回写主表）。
 * 五档传 null/不传 = 不改档位（只改名/主题时不必带）。
 */
interface ValueMonitorUpdateParams {
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

/** 修改估值监测记录 */
export function updateValueMonitor(id: number, params: ValueMonitorUpdateParams) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/value-monitors/${id}`,
    method: 'put',
    data: params
  });
}

/**
 * 删除估值监测记录
 *
 * 外键是 RESTRICT：有子数据时返回 **409 + 各子表计数**（让「删标的」先看代价）。
 * `cascade=true` 才按序删子表再删主表（不删成交笔记——它挂 bill_id，与标的无关）。
 */
export function deleteValueMonitor(id: number, cascade = false) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/value-monitors/${id}`,
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
export interface ValueMonitorDetail {
  vm: Api.Irs.ValueMonitor;
  /** 当前生效版（只有日期 + 备注，五档见 versions Tab 懒加载） */
  current_version: { effective_date: string; note: string | null } | null;
  /** 剧本前 10 条（概览只读展示） */
  plans_preview: Api.Irs.VmPlan[];
  /** 最新一版研究（概览决策卡） */
  latest_research: Api.Irs.VmResearch | null;
  /** 轻量计数（概览只关心"有多少"） */
  plans_active_count: number;
  plans_total_count: number;
  logic_total_count: number;
  invalidate_total_count: number;
  group_rows: number;
  bill_rows: number;
}

/** 归属合约行（对应交易代码） */
export interface VmGroup {
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
export interface VmTrade {
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
  vm_symbol: string;
  note_idea: string | null;
  note_idea_at: string | null;
  /** 该想法关联的剧本 irs_vm_plan.id（未关联为 null） */
  plan_id: number | null;
}

/** 复盘（标的层，锚定一版研究 irs_vm_research；review_date 由后端填） */
export interface VmReview {
  id: number;
  symbol: string;
  /** 锚定的研究版本 irs_vm_research.id */
  research_id: number;
  content: string;
  /** 落笔日期（后端填，前端不可传） */
  review_date: string;
  create_time: string;
  update_time: string;
}

/** 查询标的详情（主表 + 当前档位 + 研究 + 计划 + 归属合约 + 成交） */
export function fetchValueMonitorDetail(id: number) {
  return request<ValueMonitorDetail>({
    url: `/api/v1/irs/value-monitors/${id}/detail`,
    method: 'get'
  });
}

/** 分页查询标的的对应交易代码（id 倒序；分类精确、合约模糊） */
export function fetchVmGroups(
  id: number,
  opts: { page?: number; pageSize?: number; category?: string | null; symbol?: string | null } = {}
) {
  return request<{ items: VmGroup[]; total: number; page: number; page_size: number }>({
    url: `/api/v1/irs/value-monitors/${id}/groups`,
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
export function fetchValueMonitorTrades(
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
  return request<{ items: VmTrade[]; total: number; page: number; page_size: number }>({
    url: `/api/v1/irs/value-monitors/${id}/trades`,
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
export function fetchVmCoverage() {
  return request<{ items: Api.Irs.VmCoverageRow[]; total_bills: number }>({
    url: '/api/v1/irs/value-monitors/coverage',
    method: 'get'
  });
}

/** 未归属的合约行（排除资金流水行与同代码自动命中，即可操作清单） */
export function fetchVmUnmapped(limit = 300) {
  return request<{ items: Api.Irs.VmUnmappedRow[]; count: Record<string, number> }>({
    url: '/api/v1/irs/value-monitors/unmapped',
    method: 'get',
    params: { limit }
  });
}

// ---------------------------------------------------------------- 档位版本
/** 查询该标的全部档位版本（日期倒序，带现算 pv_* / status / diff） */
export function fetchVmVersions(id: number) {
  return request<Api.Irs.VmVersion[]>({
    url: `/api/v1/irs/value-monitors/${id}/versions`,
    method: 'get'
  });
}

/** 档位版本保存参数 */
export interface VmVersionSaveParams {
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
export function saveVmVersion(id: number, params: VmVersionSaveParams) {
  return request<{
    status: string;
    action: 'created' | 'updated' | 'unchanged';
    effective_date: string;
    /** 档位分位校验告警（P2-4：level/pb_pct/message） */
    warnings?: Array<{ level: string; pb_pct: number; message: string }>;
  }>({
    url: `/api/v1/irs/value-monitors/${id}/versions`,
    method: 'post',
    data: params
  });
}

/** 删除某一版档位（删完主表按剩余版本回写） */
export function deleteVmVersion(id: number, versionId: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/value-monitors/${id}/versions/${versionId}`,
    method: 'delete'
  });
}

// ---------------------------------------------------------------- 研究定稿
/** 查询该标的全部研究定稿（日期倒序） */
export function fetchVmResearch(id: number) {
  return request<Api.Irs.VmResearch[]>({
    url: `/api/v1/irs/value-monitors/${id}/research`,
    method: 'get'
  });
}

/** 研究保存参数（按 (symbol, research_date) upsert，未传字段保持不变） */
export interface VmResearchSaveParams {
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
export function saveVmResearch(id: number, params: VmResearchSaveParams) {
  return request<{ status: string; action: string; research_date: string }>({
    url: `/api/v1/irs/value-monitors/${id}/research`,
    method: 'put',
    data: params
  });
}

/** 删除某一版研究（按日期定位，不是按 id） */
export function deleteVmResearch(id: number, researchDate: string) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/value-monitors/${id}/research`,
    method: 'delete',
    params: { research_date: researchDate }
  });
}

// ---------------------------------------------------------------- 复盘（锚定研究版本）
/** 查询该标的全部复盘（review_date 倒序） */
export function fetchVmReviews(id: number) {
  return request<VmReview[]>({
    url: `/api/v1/irs/value-monitors/${id}/reviews`,
    method: 'get'
  });
}

/** 复盘保存参数（review_date 由后端填，前端不可传） */
export interface VmReviewSaveParams {
  /** 锚定的研究版本 irs_vm_research.id */
  research_id: number;
  content: string;
}

/** 新建一条复盘（同一研究版本可多次复盘） */
export function createVmReview(id: number, params: VmReviewSaveParams) {
  return request<VmReview>({
    url: `/api/v1/irs/value-monitors/${id}/reviews`,
    method: 'post',
    data: params
  });
}

/** 改写一条复盘（锚定的研究版本可换） */
export function updateVmReview(reviewId: number, params: VmReviewSaveParams) {
  return request<VmReview>({
    url: `/api/v1/irs/reviews/${reviewId}`,
    method: 'put',
    data: params
  });
}

/** 删除一条复盘 */
export function deleteVmReview(reviewId: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/reviews/${reviewId}`,
    method: 'delete'
  });
}

// ---------------------------------------------------------------- 计划委托
/** 查询该标的的计划委托（含派生状态与有效触发价） */
export function fetchVmPlans(id: number) {
  return request<Api.Irs.VmPlan[]>({
    url: `/api/v1/irs/value-monitors/${id}/plans`,
    method: 'get'
  });
}

/** 剧本保存参数（按 seq upsert，同标的同 seq 覆盖） */
export interface VmPlanSaveParams {
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
export function saveVmPlan(id: number, params: VmPlanSaveParams) {
  return request<{ status: string; action: string; seq: number }>({
    url: `/api/v1/irs/value-monitors/${id}/plans`,
    method: 'put',
    data: params
  });
}

/** 轻量刷新：只拉当前标的剧本（不含详情抽屉的 10 合 1 大接口开销） */
export function fetchValueMonitorPlans(id: number) {
  return request<Api.Irs.VmPlan[]>({
    url: `/api/v1/irs/value-monitors/${id}/plans`,
    method: 'get'
  });
}

/** 删除一条计划（按 seq） */
export function deleteVmPlan(id: number, seq: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/value-monitors/${id}/plans/${seq}`,
    method: 'delete'
  });
}

/** 无计划成交（成交早于该标的任何计划的建立时间——纪律的唯一可算证据） */
export function fetchVmUnplanned(id: number) {
  return request<{ items: VmTrade[]; count: number }>({
    url: `/api/v1/irs/value-monitors/${id}/unplanned`,
    method: 'get'
  });
}

// ---------------------------------------------------------------- 逻辑 / 证伪
/** 查询投资逻辑清单 */
export function fetchVmLogic(id: number) {
  return request<Api.Irs.VmLogic[]>({
    url: `/api/v1/irs/value-monitors/${id}/logic`,
    method: 'get'
  });
}

/** 逻辑保存参数（按 seq upsert；state 变化时才写 state_at） */
export interface VmLogicSaveParams {
  seq: number;
  content: string;
  pricing?: string | null;
  /** 完好 / 减弱 / 破坏（与后端 STATE_CHOICES 一致；曾经写成「受损」会导致按 state 聚合漏数） */
  state?: string;
  evidence?: string | null;
}

/** 保存一条投资逻辑（⚠️ 全字段覆盖：行内只改 state 时必须回填 content/pricing/evidence） */
export function saveVmLogic(id: number, params: VmLogicSaveParams) {
  return request<{ status: string; action: string; id: number; warning: string | null }>({
    url: `/api/v1/irs/value-monitors/${id}/logic`,
    method: 'put',
    data: params
  });
}

/** 删除一条投资逻辑（后端会把引用它的证伪 logic_id 置 NULL，返回被摘掉引用的条数） */
export function deleteVmLogic(id: number, seq: number) {
  return request<{ status: string; message: string; unlinked_invalidates: number }>({
    url: `/api/v1/irs/value-monitors/${id}/logic/${seq}`,
    method: 'delete'
  });
}

/** 查询证伪条件清单（quantified=false 表示 signal 里没有数字阈值，应标红） */
export function fetchVmInvalidate(id: number) {
  return request<Api.Irs.VmInvalidate[]>({
    url: `/api/v1/irs/value-monitors/${id}/invalidate`,
    method: 'get'
  });
}

/** 证伪条件保存参数（按 seq upsert；只登记，不自动计算触发） */
export interface VmInvalidateSaveParams {
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
export function saveVmInvalidate(id: number, params: VmInvalidateSaveParams) {
  return request<{ status: string; action: string; id: number; quantified: boolean; warning: string | null }>({
    url: `/api/v1/irs/value-monitors/${id}/invalidate`,
    method: 'put',
    data: params
  });
}

/** 删除一条证伪条件（按 seq） */
export function deleteVmInvalidate(id: number, seq: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/irs/value-monitors/${id}/invalidate/${seq}`,
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
  return request<Api.Irs.VmPlan[]>({
    url: '/api/v1/irs/plans',
    method: 'get'
  });
}

/** 某标的状态演化时间轴（逻辑 state + 证伪 status 的 append-only 日志） */
export function fetchVmStateLog(id: number) {
  return request<Api.Irs.VmStateLog[]>({
    url: `/api/v1/irs/value-monitors/${id}/state-log`,
    method: 'get'
  });
}

/** 全部标的的目标仓位（决策层） */
export function fetchVmTargets() {
  return request<Api.Irs.VmTarget[]>({
    url: '/api/v1/irs/targets',
    method: 'get'
  });
}

/** 保存目标仓位（按 symbol upsert，target_pct=null 表示未设定） */
export function saveVmTarget(symbol: string, targetPct: number | null, note?: string | null) {
  return request<{ status: string; action: string; id: number }>({
    url: '/api/v1/irs/targets',
    method: 'put',
    data: { symbol, target_pct: targetPct, note }
  });
}

/** 删除一个标的的目标仓位 */
export function deleteVmTarget(symbol: string) {
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
type IrsSyncTarget = 'discount-symbol' | 'discount-monitor' | 'value-monitor-hlc' | 'value-monitor';

/** 触发 irs 同步 */
export function syncIrs(target: IrsSyncTarget) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/sync/${target}`,
    method: 'post'
  });
}
