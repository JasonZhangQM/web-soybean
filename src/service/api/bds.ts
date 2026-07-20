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
  /** 代码模糊匹配 */
  symbol?: string;
  /** 行业精确匹配 */
  industry?: string;
  /** 代码或名称任一模糊匹配（OR，用于远程搜索） */
  keyword?: string;
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
  /** 指数代码（多选精确匹配） */
  index_code?: string[];
  /** 成分股代码（模糊匹配） */
  symbol?: string;
  /** 交易日期（YYYY-MM-DD，精确匹配） */
  trade_date?: string;
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

/** 同步指数成分股（可指定交易日，未指定则获取最新交易日数据） */
export function syncIndexConstituent(trade_date?: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/index-constituent',
    method: 'post',
    params: trade_date ? { trade_date } : undefined
  });
}

/** 指数累计收益率查询参数 */
export interface IndexCumReturnQueryParams {
  /** 起始日期（YYYY-MM-DD），默认当前日期前30天 */
  start_date?: string;
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

/** 查询经济指标分页列表 */
export function fetchEconomicIndicators(params: Api.Bds.EconomicIndicatorQueryParams) {
  return request<Api.Common.PageResponse<Api.Bds.EconomicIndicator>>({
    url: '/api/v1/bds/economic-indicators',
    method: 'get',
    params
  });
}

/** 获取各经济指标最新值 */
export function fetchEconomicIndicatorsLatest() {
  return request<Api.Bds.EconomicIndicator[]>({
    url: '/api/v1/bds/economic-indicators/latest',
    method: 'get'
  });
}

/** 获取经济指标代码列表（用于下拉选项） */
export function fetchEconomicIndicatorCodes() {
  return request<Api.Bds.EconomicIndicatorCode[]>({
    url: '/api/v1/bds/economic-indicator-codes',
    method: 'get'
  });
}

/** 同步单个经济指标（按指标代码精确匹配） */
export function syncEconomicIndicator(indicator_code: string) {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/economic-indicator',
    method: 'post',
    params: { indicator_code }
  });
}

/** 同步全部经济指标 */
export function syncAllEconomicIndicators() {
  return request<Api.Bds.SyncResult>({
    url: '/api/v1/bds/sync/economic-indicators-all',
    method: 'post'
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
