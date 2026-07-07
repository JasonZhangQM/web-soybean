import { request } from '../request';

/** 账单汇总查询参数 */
interface GroupQueryParams {
  /** 账户（多选精确匹配） */
  account?: string[];
  /** 类别（多选精确匹配） */
  category?: string[];
  /** 证券代码（模糊） */
  symbol?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询账单汇总列表 */
export function fetchGroups(params?: GroupQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.Group>>({
    url: '/api/v1/bills/group',
    method: 'get',
    params
  });
}

/** 交易收益查询参数 */
interface BillQueryParams {
  /** 账户（多选精确匹配） */
  account?: string[];
  /** 类别（多选精确匹配） */
  category?: string[];
  /** 证券代码（模糊） */
  symbol?: string;
  /** 证券名称（模糊） */
  name?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询交易收益列表 */
export function fetchBills(params?: BillQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.Bill>>({
    url: '/api/v1/bills/bills',
    method: 'get',
    params
  });
}

/** 账单收益查询参数 */
interface ProfitQueryParams {
  /** 账户（多选精确匹配） */
  account?: string[];
  /** 类别（多选精确匹配） */
  category?: string[];
  /** 证券代码（模糊） */
  symbol?: string;
  /** 证券名称（模糊） */
  name?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询账单收益列表 */
export function fetchProfits(params?: ProfitQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.Profit>>({
    url: '/api/v1/bills/profits',
    method: 'get',
    params
  });
}

/** 账户汇总查询参数 */
interface GroupAccQueryParams {
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询账户汇总列表 */
export function fetchGroupAccs(params?: GroupAccQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.GroupAcc>>({
    url: '/api/v1/bills/group-accs',
    method: 'get',
    params
  });
}

/** 标的汇总查询参数 */
interface GroupSymbolQueryParams {
  /** 类别（多选精确匹配） */
  category?: string[];
  /** 证券代码（模糊） */
  symbol?: string;
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询标的汇总列表 */
export function fetchGroupSymbols(params?: GroupSymbolQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.GroupSymbol>>({
    url: '/api/v1/bills/group-symbols',
    method: 'get',
    params
  });
}

/** 查询标的汇总的类别选项列表（distinct 升序） - 兼容旧接口 */
export function fetchGroupSymbolCategories() {
  return request<{ categories: string[] }>({
    url: '/api/v1/bills/group-symbols/categories',
    method: 'get'
  });
}

/** 查询交易类别列表（通用接口，从 Config.MAP_CATEGORY 获取） */
export function fetchCategories() {
  return request<{ categories: string[] }>({
    url: '/api/v1/bills/categories',
    method: 'get'
  });
}

/** 查询账户列表（通用接口，从 Config.ACCOUNT_INFO 获取） */
export function fetchAccounts() {
  return request<{ accounts: string[] }>({
    url: '/api/v1/bills/accounts',
    method: 'get'
  });
}

/** 年度收益查询参数 */
interface ProfitYearQueryParams {
  /** 每页条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 查询年度收益列表 */
export function fetchProfitYears(params?: ProfitYearQueryParams) {
  return request<Api.Common.PageResponse<Api.Bills.ProfitYear>>({
    url: '/api/v1/bills/profit-years',
    method: 'get',
    params
  });
}

/** 同步账单汇总 */
export function syncGroup() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/sync/group',
    method: 'post'
  });
}

/** 同步标的汇总 */
export function syncGroupSymbol() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/sync/group-symbol',
    method: 'post'
  });
}

/** 同步账户汇总 */
export function syncGroupAcc() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/sync/group-acc',
    method: 'post'
  });
}

/** 触发账单批量导入（后端执行 run/batch-import 任务） */
export function batchImportBills() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/run/batch-import',
    method: 'post'
  });
}
