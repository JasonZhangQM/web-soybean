import { request } from '../request';

/** 估值监测查询参数 */
interface ValueMonitorQueryParams {
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询估值监测列表 */
export function fetchValueMonitor(params?: ValueMonitorQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.MonitorValue>>({
    url: '/api/v1/irs/value-monitor',
    method: 'get',
    params
  });
}

/** 估值配置查询参数 */
interface SymbolValueQueryParams {
  /** 证券代码（精确） */
  symbol?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询估值配置列表 */
export function fetchSymbolValues(params?: SymbolValueQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.SymbolValue>>({
    url: '/api/v1/irs/symbol-values',
    method: 'get',
    params
  });
}

/** 估值指标查询参数 */
interface SymbolKpiQueryParams {
  /** 证券代码（精确） */
  symbol?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询估值指标列表 */
export function fetchSymbolKpis(params?: SymbolKpiQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.SymbolKpi>>({
    url: '/api/v1/irs/symbol-kpis',
    method: 'get',
    params
  });
}

/** 期权配置查询参数 */
interface SymbolOptionQueryParams {
  /** 标的代码 */
  underlying_symbol?: string;
  /** 标的名称 */
  underlying_name?: string;
  /** 行权价 */
  price_strike?: number;
  /** 剩余天数 */
  days_left?: number;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询期权配置列表 */
export function fetchSymbolOptions(params?: SymbolOptionQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.SymbolOption>>({
    url: '/api/v1/irs/symbol-options',
    method: 'get',
    params
  });
}

/** 期权监测查询参数 */
interface MonitorOptionQueryParams {
  /** 期权代码 */
  symbol?: string;
  /** 标的代码 */
  underlying_symbol?: string;
  /** 标的名称 */
  underlying_name?: string;
  /** 期权类型(call/put) */
  option_type?: string;
  /** 剩余天数 */
  days_left?: number;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询期权监测列表 */
export function fetchMonitorOptions(params?: MonitorOptionQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.MonitorOption>>({
    url: '/api/v1/irs/monitor-options',
    method: 'get',
    params
  });
}

/** 期权T型报价查询参数 */
interface MonitorOptionTQueryParams {
  /** 标的代码 */
  underlying_symbol?: string;
  /** 标的名称 */
  underlying_name?: string;
  /** 行权价 */
  price_strike?: number;
  /** 剩余天数 */
  days_left?: number;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询期权T型报价列表 */
export function fetchMonitorOptionTs(params?: MonitorOptionTQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.MonitorOptionT>>({
    url: '/api/v1/irs/monitor-option-ts',
    method: 'get',
    params
  });
}

/** 贴水监测查询参数 */
interface MonitorDiscountQueryParams {
  /** 真实合约代码（模糊匹配） */
  symbol?: string;
  /** 连续合约代码（模糊匹配） */
  symbol_con?: string;
  /** 合约类别（精确匹配） */
  symbol_type?: string;
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

/** irs 同步目标类型 */
type IrsSyncTarget =
  | 'symbol-value'
  | 'symbol-kpi'
  | 'monitor-value'
  | 'symbol-option'
  | 'symbol-underlying'
  | 'monitor-option'
  | 'monitor-option-t'
  | 'symbol-discount'
  | 'monitor-discount';

/** 触发 irs 同步 */
export function syncIrs(target: IrsSyncTarget) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/sync/${target}`,
    method: 'post'
  });
}
