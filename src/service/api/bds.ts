import { request } from '../request';

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
  /** 名称模糊匹配 */
  name?: string;
  /** 行业精确匹配 */
  industry?: string;
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
  /** 结束日期（YYYY-MM-DD） */
  end_date?: string;
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
  /** 开始日期（YYYY-MM-DD） */
  start_date?: string;
  /** 结束日期（YYYY-MM-DD） */
  end_date?: string;
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
