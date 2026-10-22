import { request } from '../request';

/** 账单汇总查询参数 */
interface GroupQueryParams {
  /** 账户（单选精确匹配） */
  account?: string | null;
  /** 类别（单选精确匹配） */
  category?: string | null;
  /** 证券代码（模糊） */
  symbol?: string;
  /** 仅返回当前市值不为 0 的记录 */
  value_only?: boolean;
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
  /** 账户（单选精确匹配） */
  account?: string | null;
  /** 类别（单选精确匹配） */
  category?: string | null;
  /** 证券代码（模糊） */
  symbol?: string;
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
  /** 账户（单选精确匹配） */
  account?: string | null;
  /** 仅显示账户净值不为 0 的记录 */
  acc_aset_only?: boolean;
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
  /** 类别（单选精确匹配） */
  category?: string | null;
  /** 证券代码（模糊） */
  symbol?: string;
  /** 仅显示当前市值不为 0 的记录 */
  value_only?: boolean;
  /** 持仓状态：holding=持仓中，closed=已平仓 */
  pos_state?: 'holding' | 'closed';
  /** 仅显示写过笔记的记录 */
  has_note?: boolean;
  /** 主题标签（精确匹配） */
  theme?: string;
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

/** 查询已使用过的主题标签（去重 + 行数，供筛选下拉；不受当前筛选影响） */
export function fetchGroupSymbolThemes() {
  return request<{ items: { theme: string; count: number }[] }>({
    url: '/api/v1/bills/group-symbols/themes',
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

/** 同步实时估值 + 标的汇总 + 账户汇总 */
export function syncGroup() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/sync/group',
    method: 'post'
  });
}

/** 触发账单批量导入（后端执行 run/batch-import 任务）
 *  批量导入含数据拉取、加工、盈亏计算等多步，耗时较长，
 *  单独设置 1 分钟超时，覆盖全局默认值
 */
export function batchImportBills() {
  return request<Api.Bills.SyncResult>({
    url: '/api/v1/bills/run/batch-import',
    method: 'post',
    timeout: 60 * 1000
  });
}

/** Bill 修改参数（所有字段可选，只传需要修改的字段） */
export interface BillUpdateParams {
  trade_time?: string | null;
  symbol?: string;
  name?: string;
  exec_type?: string;
  category1?: string;
  category?: string;
  b_s?: string | null;
  c_p?: string | null;
  o_c?: string | null;
  price?: number;
  vol?: number;
  amount?: number;
  amount_act?: number;
  balance?: number | null;
  fee_tax?: number | null;
  fees?: number | null;
  taxes?: number | null;
  fee_exec1?: number | null;
  fee_exec2?: number | null;
  fee_exec3?: number | null;
  fee_hand?: number | null;
  fee_sr?: number | null;
  fee_clear?: number | null;
  fee_reg?: number | null;
  fee_other?: number | null;
  premium?: number | null;
  cash?: number | null;
  id_exec?: string | null;
  id_agree?: string | null;
  currency?: string;
  account_id?: string | null;
  market?: string | null;
  account?: string;
}

/** 修改 Bill 记录（PATCH /bills/bills/{id}） */
export function updateBill(id: number, params: BillUpdateParams) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/bills/bills/${id}`,
    method: 'patch',
    data: params
  });
}

/** Group 修改参数（仅 profit_time / value_time 可编辑） */
export interface GroupUpdateParams {
  profit_time?: string | null;
  value_time?: string | null;
}

/** 修改 Group 记录（PATCH /bills/group/{id}） */
export function updateGroup(id: number, params: GroupUpdateParams) {
  return request<{ status: string; message: string }>({
    url: `/api/v1/bills/group/${id}`,
    method: 'patch',
    data: params
  });
}

/** 标的笔记修改参数（仅 5 个手动字段可编辑；note_at 由后端填） */
export interface GroupSymbolNoteParams {
  logic?: string | null;
  plan?: string | null;
  invalidate?: string | null;
  review?: string | null;
  theme?: string | null;
}

/** 修改标的笔记（PATCH /bills/group-symbols/{id}） */
export function updateGroupSymbolNote(id: number, params: GroupSymbolNoteParams) {
  return request<{ status: string; message: string; fields: string[]; note_at: string | null }>({
    url: `/api/v1/bills/group-symbols/${id}`,
    method: 'patch',
    data: params
  });
}
