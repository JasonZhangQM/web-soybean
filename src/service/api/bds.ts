import { request } from '../request';

/** 交易日历查询参数 */
interface TradeDateQueryParams {
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
