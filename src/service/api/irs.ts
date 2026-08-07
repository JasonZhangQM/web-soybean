import { request } from '../request';

/** 估值监测（ValueMonitor 独立表）查询参数 */
interface ValueMonitorsQueryParams {
  /** 代码（模糊匹配） */
  symbol?: string;
  /** 名称（模糊匹配） */
  name?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询估值监测列表（ValueMonitor 独立表） */
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
}

/** 新增估值监测记录 */
export function createValueMonitor(params: ValueMonitorCreateParams) {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/value-monitors',
    method: 'post',
    data: params
  });
}

/** 估值监测修改参数（symbol 不可改） */
interface ValueMonitorUpdateParams {
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

/** 删除估值监测记录 */
export function deleteValueMonitor(id: number) {
  return request<Api.Irs.SyncResult>({
    url: `/api/v1/irs/value-monitors/${id}`,
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
  | 'discount-symbol'
  | 'discount-monitor'
  | 'value-monitor-hlc'
  | 'value-monitor';

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
    timeout: 3 * 60 * 1000 // 3分钟超时，akshare + gm 调用耗时较长
  });
}

/** 清理已到期期权数据（删除剩余天数 days_left <= 0 的记录） */
export function cleanOptionMonitor() {
  return request<Api.Irs.SyncResult>({
    url: '/api/v1/irs/clean/option-monitor',
    method: 'post'
  });
}

/** 获取各经济指标最新值（可视化分析查询，复用 bds EconomicIndicator 数据） */
export function fetchEconomicIndicatorsLatest() {
  return request<Api.Bds.EconomicIndicator[]>({
    url: '/api/v1/irs/economic-indicators/latest',
    method: 'get'
  });
}
