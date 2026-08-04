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

/** 期权监测合并查询参数 */
interface OptionMonitorQueryParams {
  /** 标的代码（精确匹配） */
  underlying_symbol?: string;
  /** 期权类型（精确匹配） */
  option_type?: string;
  /** 期权代码（模糊匹配） */
  symbol?: string;
  /** 到期月(YYYYMM)，按 delisted_date 所在月范围筛选 */
  end_month?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询期权监测合并列表 */
export function fetchOptionMonitors(params?: OptionMonitorQueryParams) {
  return request<Api.Common.PageResponse<Api.Irs.OptionMonitor>>({
    url: '/api/v1/irs/option-monitors',
    method: 'get',
    params
  });
}

/** 期权标的下拉选项（标的代码列表） */
interface OptionUnderlyingsResponse {
  /** 标的代码选项列表 */
  underlying_symbols: Array<{ label: string; value: string }>;
}

/** 获取期权标地下拉选项（从 Config.OPTIONS_MARCH 取数，无数据库查询） */
export function fetchOptionUnderlyings() {
  return request<OptionUnderlyingsResponse>({
    url: '/api/v1/irs/option-underlyings',
    method: 'get'
  });
}

/** irs 同步目标类型 */
type IrsSyncTarget =
  | 'symbol-value'
  | 'symbol-kpi'
  | 'monitor-value'
  | 'discount-symbol'
  | 'discount-monitor';

/** 触发 irs 同步 */
export function syncIrs(target: IrsSyncTarget) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/sync/${target}`,
    method: 'post'
  });
}

/** 期权行情同步参数 */
interface OptionMonitorSyncParams {
  /** 期权品种名称（如"沪深300股指期权"） */
  option_name: string;
  /** 到期年月，格式 YYYYMM（如"202608"） */
  end_month: string;
}

/** 同步期权行情（akshare 获取期权行情 + gm 获取标的现价） */
export function syncOptionMonitor(params: OptionMonitorSyncParams) {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/sync/option-monitor',
    method: 'post',
    params,
    timeout: 60 * 1000 // 60秒超时，akshare + gm 调用耗时较长
  });
}

/** 清理已到期期权数据（删除剩余天数 days_left <= 0 的记录） */
export function cleanOptionMonitor() {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/clean/option-monitor',
    method: 'post'
  });
}
