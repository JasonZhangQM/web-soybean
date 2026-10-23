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
  /** 证券名称 / 合约简称（模糊） */
  name?: string;
  /** 归属标的（精确，经 bills_group_symbol 关联） */
  vm_symbol?: string;
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
  /** 归属筛选：yes=已归属；no=未归属（排除融资融券，它本来就不归属） */
  mapped?: 'yes' | 'no';
  /** 按归属标的精确筛选（如 SHSE.000300） */
  vm_symbol?: string;
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

/** 查询归属计数：已归属 / 未归属 / 融资融券（顶部提示「还有多少行没选」） */
export function fetchGroupSymbolsCoverage() {
  return request<Api.Bills.GroupSymbolCoverage>({
    url: '/api/v1/bills/group-symbols/unmapped-count',
    method: 'get'
  });
}

/** 归属参数（vm_symbol 传 null = 清空归属） */
export interface GroupSymbolVmParams {
  vm_symbol: string | null;
}

/**
 * 修改合约行的归属标的（PATCH /bills/group-symbols/{id}/vm）
 *
 * 后端只写 vm_symbol 一列（铁律 4.9 白名单），不会碰派生列。
 * 融资融券行传非空值 -> 400（融资只是融资行为，name 不承担归属含义）。
 */
export function updateGroupSymbolVm(id: number, params: GroupSymbolVmParams) {
  return request<{ status: string; vm_symbol: string | null }>({
    url: `/api/v1/bills/group-symbols/${id}/vm`,
    method: 'patch',
    data: params
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

/**
 * 删除账单（DELETE /bills/bills/{id}）
 *
 * 后端硬约束：只允许删除所属账户的「最后一笔」（trade_time 最大）。
 * 删中间/前面会被拒，因为导入按 trade_time > MAX 增量过滤，删掉的行不会被下次导入补回。
 * 删除会级联删掉 bills_profit 对应行，并把受影响的 bills_group.profit_time 清空
 * （标记待重算，须再跑一次同步才会刷新汇总）。
 */
export function deleteBill(id: number) {
  return request<{
    status: string;
    message: string;
    /** 级联删除的账单收益行数 */
    deleted_profit: number;
    /** 被标记待重算的汇总组数 */
    flagged_groups: number;
  }>({
    url: `/api/v1/bills/bills/${id}`,
    method: 'delete'
  });
}

/** 成交笔记类型（后端 kind 字段，只能这两个值） */
export type BillNoteKind = '想法' | '复盘';

/** 查询某笔成交的全部笔记（想法/复盘，最多两条） */
export function fetchBillNotes(id: number) {
  return request<Api.Bills.BillNote[]>({
    url: `/api/v1/bills/${id}/note`,
    method: 'get'
  });
}

/**
 * 写一笔成交的笔记（PUT /bills/bills/{id}/note/{kind}）
 *
 * - content 传空串 = 删除该条（不留空壳）
 * - content_at 由后端在首次写入时打，前端不可传——否则「当时写的」可以被伪造
 * - 独立端点，不走 PATCH /bills/{id}：那是 36 字段的宽口子，
 *   一旦有人给它加「回写全列」，笔记会被静默冲成 NULL
 */
export function saveBillNote(id: number, kind: BillNoteKind, content: string) {
  return request<{
    status: string;
    /** created=新建 / updated=改写 / deleted=空串即删除 / noop=本来就没有 */
    action: 'created' | 'updated' | 'deleted' | 'noop';
    kind: string;
    /** 落笔时间，仅 created/updated 返回 */
    content_at?: string | null;
  }>({
    url: `/api/v1/bills/${id}/note/${encodeURIComponent(kind)}`,
    method: 'put',
    data: { content }
  });
}

/** 无计划成交查询参数 */
interface UnplannedBillsQueryParams {
  /** 账户（精确匹配） */
  account?: string | null;
  /** 只统计某月（YYYY-MM），空 = 全部 */
  month?: string | null;
  /** 最多返回条数 */
  limit?: number;
}

/** 无计划成交行（成交早于该标的任何计划的建立时间） */
export interface UnplannedBill {
  id: number;
  trade_time: string;
  account: string;
  category: string;
  symbol: string;
  name: string;
  b_s: string | null;
  o_c: string | null;
  price: number;
  vol: number;
  vm_symbol: string;
  /** 该标的首条计划的建立时间；null = 一笔计划都没有 */
  first_plan_at: string | null;
}

/**
 * 无计划成交：成交时间早于该标的**任何计划**的建立时间。
 *
 * 这是「先斩后奏 / 事后补计划」的唯一可算证据——研究报告日期、计划日期、
 * 成交日期三者的先后，就是纪律的度量，文本永远算不出来。
 */
export function fetchUnplannedBills(params?: UnplannedBillsQueryParams) {
  return request<{ items: UnplannedBill[]; count: number }>({
    url: '/api/v1/bills/unplanned',
    method: 'get',
    params
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
