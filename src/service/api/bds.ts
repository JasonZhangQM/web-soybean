import { request } from '../request';

/** 获取指数代码列表（用于下拉选项，数据源为后端 Config.INDEX_CODE 字典） */
export function fetchIndexCodes() {
  return request<{ index_codes: Api.Bds.IndexCodeItem[] }>({
    url: '/api/v1/bds/index-codes',
    method: 'get'
  });
}

/** 获取去重后的行业列表（数据源为 bds_symbol_info 表 industry 字段 DISTINCT） */
export function fetchSymbolIndustries() {
  return request<{ industries: string[] }>({
    url: '/api/v1/bds/symbol-industries',
    method: 'get'
  });
}

/** 交易日历查询参数 */
interface TradeDateQueryParams {
  /** 开始日期（YYYY-MM-DD） */
  start_date?: string;
  /** 结束日期（YYYY-MM-DD） */
  end_date?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询交易日历列表 */
export function fetchTradeDates(params?: TradeDateQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.TradeDate>>({
    url: '/api/v1/bds/trade-dates',
    method: 'get',
    params
  });
}

/** 证券信息查询参数 */
interface SymbolInfoQueryParams {
  /** 代码精确匹配 */
  symbol?: string;
  /** 行业精确匹配 */
  industry?: string;
  /** 市场精确匹配：上交所 / 深交所 / 北交所 */
  market?: string;
  /** 板块精确匹配：主板 / 创业板 / 科创板 / 北交所 */
  board?: string;
  /** 代码或名称任一模糊匹配（OR，用于远程搜索） */
  keyword?: string;
  /** 剔除 sync_at >= 该日期（YYYY-MM-DD）的标的，用于批量同步断点续跑；不传=不跳过 */
  exclude_synced_since?: string;
  /** 当日同步状态筛选：synced=今日已同步，unsynced=今日未同步，不传=全部 */
  sync_status?: 'synced' | 'unsynced';
  /** 退市状态筛选：trading=仅在市，delisted=仅退市，不传=全部 */
  trading_status?: 'trading' | 'delisted';
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询证券信息列表 */
export function fetchSymbolInfos(params?: SymbolInfoQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.SymbolInfo>>({
    url: '/api/v1/bds/symbol-infos',
    method: 'get',
    params
  });
}

/** 同步交易日历 */
export function syncTradeDate() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/trade-date',
    method: 'post'
  });
}

/** 同步证券信息 */
export function syncSymbolInfo() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/symbol-info',
    method: 'post'
  });
}

/** 指数历史行情查询参数 */
interface IndexHistoryQueryParams {
  /** 代码（多选精确匹配） */
  symbol?: string[];
  /** 开始日期（YYYY-MM-DD） */
  start_date?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询指数历史行情列表 */
export function fetchIndexHistories(params?: IndexHistoryQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.IndexHistory>>({
    url: '/api/v1/bds/index-histories',
    method: 'get',
    params
  });
}

/** 同步指数历史行情 */
export function syncIndexHistory() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/index-history',
    method: 'post'
  });
}

/** 指数成分股查询参数 */
export interface IndexConstituentQueryParams {
  /** 指数代码（精确匹配） */
  index_code?: string;
  /** 成分股代码（精确匹配） */
  symbol?: string;
  /** 交易日期（YYYY-MM-DD，精确匹配） */
  trade_date?: string;
  /** 是否按成分股代码去重：每只仅保留交易日期最新的一条（同日跨指数取指数代码最小者） */
  dedup?: boolean;
  /** 每页条数 */
  limit: number;
  /** 偏移量 */
  offset: number;
}

/** 查询指数成分股列表 */
export function fetchIndexConstituents(params: IndexConstituentQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.IndexConstituent>>({
    url: '/api/v1/bds/index-constituents',
    method: 'get',
    params
  });
}

/** 指数成分股同步/回填请求体 */
export interface IndexConstituentSyncRequest {
  /** 本次要处理的指数代码清单（页面勾选），至少 1 个 */
  index_codes: string[];
  /**
   * 回填起点 YYYY-MM-DD；不传=各指数从核查水位 checked_to+1 增量
   * （水位未初始化退回库内最新交易日+1）。传早于当前水位的日期属历史补录，水位不回退。
   */
  start_date?: string;
}

/** 启动指数成分股同步/回填任务（后台线程异步执行，立即返回 task 对象，需轮询进度） */
export function startIndexConstituentSync(req: IndexConstituentSyncRequest) {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/sync/index-constituent',
    method: 'post',
    data: req
  });
}

/** 指数累计收益率查询参数 */
export interface IndexCumReturnQueryParams {
  /** 起始日期（YYYY-MM-DD），默认当前日期前10年 */
  start_date?: string;
  /** 限定指数代码（可多值）；不传返回全部 INDEX_CODE */
  symbols?: string[];
}

/** 获取指数累计收益率 */
export function fetchIndexCumReturns(params?: IndexCumReturnQueryParams) {
  return request<Api.Bds.IndexCumReturn>({
    url: '/api/v1/bds/index-cum-returns',
    method: 'get',
    params
  });
}

/** 查询资产负债表列表 */
export function fetchFundBalances(params: Api.Bds.FundBalanceQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.FundBalance>>({
    url: '/api/v1/bds/fund-balances',
    method: 'get',
    params
  });
}

/** 同步资产负债表数据（单个股票代码，精确匹配） */
export function syncFundBalance(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/fund-balance',
    method: 'post',
    params: { symbol }
  });
}

/** 查询利润表列表 */
export function fetchFundIncomes(params: Api.Bds.FundIncomeQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.FundIncome>>({
    url: '/api/v1/bds/fund-incomes',
    method: 'get',
    params
  });
}

/** 同步利润表数据（单个股票代码，精确匹配） */
export function syncFundIncome(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/fund-income',
    method: 'post',
    params: { symbol }
  });
}

/** 查询现金流量表列表 */
export function fetchFundCashflows(params: Api.Bds.FundCashflowQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.FundCashflow>>({
    url: '/api/v1/bds/fund-cashflows',
    method: 'get',
    params
  });
}

/** 同步现金流量表数据（单个股票代码，精确匹配） */
export function syncFundCashflow(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/fund-cashflow',
    method: 'post',
    params: { symbol }
  });
}

/** 查询财务指标列表 */
export function fetchFinanceDerivs(params: Api.Bds.FinanceDerivQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.FinanceDeriv>>({
    url: '/api/v1/bds/finance-derivs',
    method: 'get',
    params
  });
}

/** 同步财务指标数据（单个股票代码，精确匹配） */
export function syncFinanceDeriv(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/finance-deriv',
    method: 'post',
    params: { symbol }
  });
}

/** 查询估值指标列表 */
export function fetchDailyValuations(params: Api.Bds.DailyValuationQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.DailyValuation>>({
    url: '/api/v1/bds/daily-valuations',
    method: 'get',
    params
  });
}

/** 同步估值指标数据（单个股票代码，精确匹配） */
export function syncDailyValuation(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/daily-valuation',
    method: 'post',
    params: { symbol }
  });
}

/** 查询每日市值列表 */
export function fetchDailyMktvalues(params: Api.Bds.DailyMktvalueQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.DailyMktvalue>>({
    url: '/api/v1/bds/daily-mktvalues',
    method: 'get',
    params
  });
}

/** 同步每日市值数据（单个股票代码，精确匹配） */
export function syncDailyMktvalue(symbol: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/daily-mktvalue',
    method: 'post',
    params: { symbol }
  });
}

/** 查询经济指标分页列表 */
export function fetchEconomicIndicators(params: Api.Bds.EconomicIndicatorQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.EconomicIndicator>>({
    url: '/api/v1/bds/economic-indicators',
    method: 'get',
    params
  });
}

/** 获取经济指标代码列表（用于下拉选项） */
export function fetchEconomicIndicatorCodes() {
  return request<Api.Bds.EconomicIndicatorCode[]>({
    url: '/api/v1/bds/economic-indicator-codes',
    method: 'get'
  });
}

/** 通过华尔街见闻日历接口同步经济指标（补充 forecast/importance/revised/pub_date）
 *  全量同步（如首次或 DB 清空后）需从 2015 至今按月分批拉取，耗时较长，
 *  单独设置 10 分钟超时，覆盖全局 10s 默认值
 */
export function syncEconomicIndicatorWscn() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/economic-indicator-wscn',
    method: 'post',
    timeout: 10 * 60 * 1000
  });
}

/** 查询黄金储备国家列表（用于下拉选项，数据源为后端 Config.GOLD_RESERVE_COUNTRIES 字典） */
export function fetchGoldReserveCountries() {
  return request<{ countries: Api.Bds.GoldReserveCountry[] }>({
    url: '/api/v1/bds/gold-reserve-countries',
    method: 'get'
  });
}

/** 查询黄金储备分页列表 */
export function fetchGoldReserves(params: Api.Bds.GoldReserveQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.GoldReserve>>({
    url: '/api/v1/bds/gold-reserves',
    method: 'get',
    params
  });
}

/** 同步单个国家黄金储备（按国家代码精确匹配） */
export function syncGoldReserve(country_code: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/gold-reserve',
    method: 'post',
    params: { country_code }
  });
}

/** 全量同步所有国家黄金储备（20 国 ×30s 超时上限，单独设置 5 分钟超时） */
export function syncAllGoldReserves() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/gold-reserves-all',
    method: 'post',
    timeout: 5 * 60 * 1000
  });
}

/** 获取美债收益率指标代码列表（用于下拉选项，数据源为后端 Config.YIELD_INDICATORS 字典） */
export function fetchDailyIndicatorCodes() {
  return request<Api.Bds.DailyIndicatorCode[]>({
    url: '/api/v1/bds/daily-indicator-codes',
    method: 'get'
  });
}

/** 查询美债收益率指标分页列表（indicator_code 多选 IN + 日期范围，按 report_date desc 排序） */
export function fetchDailyIndicators(params: Api.Bds.DailyIndicatorQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.DailyIndicator>>({
    url: '/api/v1/bds/daily-indicators',
    method: 'get',
    params
  });
}

/** 同步单个美债收益率指标（按指标代码精确匹配，调用 FRED API series/observations） */
export function syncDailyIndicator(indicator_code: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/daily-indicator',
    method: 'post',
    params: { indicator_code }
  });
}

/** 全量同步所有美债收益率指标（4 指标 ×15s 上限，单独设置 60 秒超时） */
export function syncAllDailyIndicators() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/daily-indicators-all',
    method: 'post',
    timeout: 60 * 1000
  });
}

/** 宏观一键同步请求体 */
export interface MacroSyncRequest {
  /**
   * 要同步的段（可只选部分）
   * - trade_date: 交易日历（仅在跨年时才真写库）
   * - symbol_info: 证券信息（东财 Excel + gm 两条通道）
   * - index_history: 指数行情（按 Config.INDEX_CODE 逐指数增量）
   * - option_info: 期权合约字典（openctp 全量刷新 25,910 行，累积不删）
   * - option_market: 期权行情（按「品种 × 到期月」逐组，范围由「期权同步清单」决定）
   * - wscn: 经济指标（华尔街见闻）
   * - daily: 美债收益率（FRED，含 2 项信用利差）
   * - gold: 黄金储备（IMF）
   *
   * 后端**固定按 trade_date → symbol_info → index_history → option_info → option_market → wscn → daily → gold 顺序执行**，
   * 与数组顺序无关；不传 ⇔ 前端默认勾选（symbol_info + index_history + option_info + option_market + wscn + daily）
   *
   * 🔴 option_info 必须排在 option_market **之前**：行情同步要从字典取逐合约乘数与权威
   * 到期日，当天新挂牌的合约若还没进字典就会被跳过。
   */
  stages?: Array<
    'trade_date' | 'symbol_info' | 'index_history' | 'option_info' | 'option_market' | 'wscn' | 'daily' | 'gold'
  >;
}

/** 启动一键同步（后台任务，返回 task 供轮询；与批量同步共用 bds_sync_task） */
export function startMacroSync(req: MacroSyncRequest = {}) {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/sync/macro',
    method: 'post',
    data: req,
    // 建任务后立即返回，实际执行在后台线程
    timeout: 30 * 1000
  });
}

/** 批量同步请求体 */
export interface BatchSyncRequest {
  /** 同步范围: all/index/industry/explicit */
  scope: string;
  /**
   * scope=index 时的指数代码清单（多选）
   * 后端按各指数**各自最新快照**取成分，求合集（并集去重）后再逐只同步
   */
  index_codes?: string[];
  /** [兼容保留] 单指数写法，等价 index_codes=[index_code]；新调用请用 index_codes */
  index_code?: string;
  /** scope=industry 时填行业名，如 银行 */
  industry?: string;
  /** scope=explicit 时填手写清单 */
  symbols?: string[];
  /** 要同步的表列表，默认 6 张全跑 */
  tables?: string[];
  /** 全部成功后是否写 sync_at 标记，默认 true */
  mark_synced?: boolean;
  /** 剔除 sync_at >= 该日期（YYYY-MM-DD）的标的；不传/null=不跳过 */
  exclude_synced_since?: string | null;
  /**
   * 退市口径，默认 trading
   * - trading: 仅在市（含已公告未退市）
   * - delisted: 仅已退市
   * - all: 全部
   *
   * 仅作用于 all / industry / index 三个 scope；explicit 手写清单不受此参数约束
   */
  trading_status?: 'trading' | 'delisted' | 'all';
  /** 最多处理几只 symbol: 0=不限 */
  max_symbols?: number;
}

/** 启动批量同步任务（后台线程异步执行，立即返回 task 对象） */
export function startBatchSync(req: BatchSyncRequest) {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/run/batch-sync',
    method: 'post',
    data: req
  });
}

/** 查询批量同步任务列表（按创建时间倒序，最新在前） */
export function fetchSyncTasks(limit = 10) {
  return request<Api.Bds.SyncTask[]>({
    url: '/api/v1/bds/sync-tasks',
    method: 'get',
    params: { limit }
  });
}

/** 查询最新一条批量同步任务（供前端轮询进度） */
export function fetchLatestSyncTask() {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/sync-tasks/latest',
    method: 'get'
  });
}

/** 查询单条批量同步任务详情（含 progress / errors） */
export function fetchSyncTask(taskId: number) {
  return request<Api.Bds.SyncTask>({
    url: `/api/v1/bds/sync-tasks/${taskId}`,
    method: 'get'
  });
}

/** 停止正在运行的批量同步任务 */
export function stopBatchSync(taskId: number) {
  return request<{ status: string; message: string }>({
    url: '/api/v1/bds/stop/batch-sync',
    method: 'post',
    params: { task_id: taskId }
  });
}

// ============================================================================
// 指数分位（P0-1）与成分核查水位（P0-0）
// ============================================================================

/**
 * 获取指数估值原始数据（行式分页，供 `/bds/index-valuation` 表格页）
 *
 * 与 `fetchIndexValuations` 的分工：那个返回 pivot 给图表画线，
 * 这里一行 = 一个指数的一天，带 n_loss / snapshot_date / calc_at 等中间量。
 */
export function fetchIndexValuationsPaged(params?: Api.Bds.IndexValuationPagedParams) {
  return request<Api.Common.PageResponse<Api.Bds.IndexValuationRow>>({
    url: '/api/v1/bds/index-valuations/paged',
    method: 'get',
    params
  });
}

/** 获取指数估值日序列（画图用） */
export function fetchIndexValuations(params?: Api.Bds.IndexValuationSeriesParams) {
  return request<Api.Bds.IndexValuationSeries>({
    url: '/api/v1/bds/index-valuations',
    method: 'get',
    params
  });
}

/** 获取指数分位汇总（分位由后端实时计算，前端零计算） */
export function fetchIndexValuationPercentiles(params?: { metric?: string }) {
  return request<Api.Bds.IndexValuationPercentileResponse>({
    url: '/api/v1/bds/index-valuation-percentiles',
    method: 'get',
    params
  });
}

/**
 * 启动指数估值重算（后台任务，立即返回 task）
 *
 * 区间语义：`start_date`/`end_date` 均闭区间；两端都空 = 逐指数增量（各指数从自己的
 * 最新已算日重叠 `days` 个交易日）；只传 end = 从各指数最早快照算起（≈全历史，慎用）。
 * 进度轮询 `/sync-tasks/{id}`，停止用 `stopBatchSync(taskId)`。
 */
export function syncIndexValuation(req: Api.Bds.IndexValuationSyncRequest) {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/sync/index-valuation',
    method: 'post',
    data: req
  });
}

/** 获取各指数成分核查水位（只读） */
export function fetchIndexConstituentSyncStatus() {
  return request<{ items: Api.Bds.IndexConstituentSyncStatus[]; total: number }>({
    url: '/api/v1/bds/index-constituent-sync-status',
    method: 'get'
  });
}

// ============================================================================
// 期权合约字典（bds_option_info）
// ============================================================================

/**
 * 分页查询合约字典（25,910 行，必须服务端分页）
 *
 * ⚠️ 标准码 `symbol` **不是全局唯一**：ETF 沿用交易所「合约简称」口径、不含标的 6 位，
 * 9 个 ETF 标的的行权价区间大量重叠 ⇒ 按代码搜跨标的会返回多行。展示时要带标的名。
 */
export function fetchOptionInfo(params?: Api.Bds.OptionInfoQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.OptionInfo>>({
    url: '/api/v1/bds/option-info',
    method: 'get',
    params
  });
}

/** 字典品种下拉（只含台账已登记的品种，带中文名） */
export function fetchOptionInfoProducts() {
  return request<Api.Bds.OptionInfoProduct[]>({
    url: '/api/v1/bds/option-info/products',
    method: 'get'
  });
}

/** 字典新鲜度：最近拉取日期 / 总行数 / 在挂张数 / 写入时刻 */
export function fetchOptionInfoLatestDate() {
  return request<Api.Bds.OptionInfoLatestDate>({
    url: '/api/v1/bds/option-info/latest-date',
    method: 'get'
  });
}

/**
 * 刷新合约字典（后台任务，立即返回 task）
 *
 * 累积不删：本次未出现的合约保留、只把 `is_listed` 置 0；且拉取行数低于哨兵
 * （20,000）时连置 0 都跳过，防止一次残缺拉取把两万多张在挂合约误标退市。
 * 停止沿用 `stopBatchSync(taskId)`。
 */
export function syncOptionInfo() {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/option-info/sync',
    method: 'post'
  });
}

// ============================================================================
// 期权行情（bds_option_market）与同步清单（bds_option_config）
// ============================================================================

/**
 * 分页查询期权行情
 *
 * 不传 `trade_date` 时后端只返回**最新交易日**的行（该表按日累积，全量会把历史快照也铺出来）。
 */
export function fetchOptionMarket(params?: Api.Bds.OptionMarketQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.OptionMarket>>({
    url: '/api/v1/bds/option-market',
    method: 'get',
    params
  });
}

/** 最新行情日期 + 各品种行数 + 最近同步时间（页面默认值与新鲜度提示） */
export function fetchOptionMarketLatestDate() {
  return request<Api.Bds.OptionMarketLatestDate>({
    url: '/api/v1/bds/option-market/latest-date',
    method: 'get'
  });
}

/** 搜索区下拉选项：品种 / 到期月 / 分组键 */
export function fetchOptionMarketFilters() {
  return request<Api.Bds.OptionMarketFilters>({
    url: '/api/v1/bds/option-market/filters',
    method: 'get'
  });
}

/**
 * 同步前置确认：启用几张合约、几个品种×到期月组合（= 几次接口请求）
 *
 * 点「行情同步」时先拿这个数再弹确认框，避免用户不知道这一下会打几次接口。
 */
export function fetchOptionSyncPlan() {
  return request<Api.Bds.OptionSyncPlan>({
    url: '/api/v1/bds/option-market/config-count',
    method: 'get'
  });
}

/**
 * 一键同步「配置的全部期权」（后台任务，立即返回 task）
 *
 * 进度轮询 `/sync-tasks/{id}`；`total_count` 是**组数**不是合约数，
 * 所以进度条要显示「第几组/共几组」。停止沿用 `stopBatchSync(taskId)`。
 */
export function syncOptionMarket() {
  return request<Api.Bds.SyncTask>({
    url: '/api/v1/bds/option-market/sync',
    method: 'post'
  });
}

/** 同步清单查询 */
export function fetchOptionConfigs(params?: { is_enabled?: number }) {
  return request<Api.Bds.OptionConfig[]>({
    url: '/api/v1/bds/option-config',
    method: 'get',
    params
  });
}

/**
 * 新增同步配置。
 *
 * 🔴 合约必须能在合约字典（`bds_option_info`）里解析到，否则后端 400。
 * 优先传 `contract_id`（全表唯一）；用 `symbol` 时 ETF 必须带 `option_name`
 * —— ETF 标准码不含标的 6 位，跨标的存在大量同码。
 */
export function createOptionConfig(data: Api.Bds.OptionConfigCreate) {
  return request<Api.Bds.OptionConfig>({
    url: '/api/v1/bds/option-config',
    method: 'post',
    data
  });
}

/**
 * 修改配置的**人工列**（启用开关 / 备注）。
 *
 * 规格字段已物理删除，权威源是合约字典，PUT 改不了——要修只能刷新字典。
 * **只发要改的字段**，后端对 null 视为不改。
 */
export function updateOptionConfig(id: number, data: Api.Bds.OptionConfigUpdate) {
  return request<Api.Bds.OptionConfig>({
    url: `/api/v1/bds/option-config/${id}`,
    method: 'put',
    data
  });
}

/** 删除配置（**不删行情**：行情是事实数据） */
export function deleteOptionConfig(id: number) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/bds/option-config/${id}`,
    method: 'delete'
  });
}
