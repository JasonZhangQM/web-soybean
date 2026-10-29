import { request } from '../request';

/** 账单汇总查询参数 */
interface GroupQueryParams {
  /** 账户（单选精确匹配） */
  account?: string | null;
  /** 类别（单选精确匹配） */
  category?: string | null;
  /** 证券代码（模糊） */
  symbol?: string;
  /** 合并搜索：代码模糊，或名称模糊命中对应代码（OR） */
  keyword?: string;
  /** 市值筛选（与 0 比较）：gt=>0，lt=<0，eq==0，ne!=0 */
  value_filter?: 'gt' | 'lt' | 'eq' | 'ne';
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
  /** 合并搜索：代码或名称任一模糊命中（OR） */
  keyword?: string;
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
  /** 账户（单选精确匹配） */
  account?: string | null;
  /** 类别（单选精确匹配） */
  category?: string | null;
  /** 代码/名称合并模糊搜索（OR） */
  keyword?: string;
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
  /** 账户价值筛选（与 0 比较）：gt=>0，lt=<0，eq==0，ne!=0 */
  acc_aset_filter?: 'gt' | 'lt' | 'eq' | 'ne';
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

/**
 * 券商码候选（`GET /bills/group-symbols/symbol-options`）
 *
 * 给「期权行情同步清单」的券商码内联下拉当选项源——这是 bds 页面跨模块调 bills 的
 * **唯一正道**：`bds_option_config.broker_symbol` 该填什么值是账单事实，权威在 bills，
 * 所以接口放 bills，bds 后端不加任何 import（规则 4.12 依赖只能向下）。
 * 写入不在这里，仍走 `updateOptionConfig(id, { broker_symbol })`。
 *
 * 服务端已按 symbol 去重、剔除资金流水占位码、持仓中的排前面，前端直接铺进下拉即可。
 *
 * @param category 交易分类，默认「期权交易」（期权持仓只会落在这一类）；传 `*` 不限
 */
export function fetchGroupSymbolOptions(category = '期权交易') {
  return request<Api.Bills.GroupSymbolCode[]>({
    url: '/api/v1/bills/group-symbols/symbol-options',
    method: 'get',
    params: { category }
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

/** 成交笔记类型（后端 kind 字段；复盘已上移到标的层，这里只剩「想法」） */
export type BillNoteKind = '想法';

/** 查询某笔成交的全部笔记（想法，最多一条） */
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
export function saveBillNote(id: number, kind: BillNoteKind, content: string, planId?: number | null) {
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
    // plan_id 仅在显式传入时回填（执行剧本后挂接）；不传则不碰已回填值
    data: planId != null ? { content, plan_id: planId } : { content }
  });
}

/** 剧本盈亏归因（读 bills_bill_note.plan_id，group by 剧本；剧本名前端按 plan_id 映射） */
export function fetchAttributionByPlan() {
  return request<Api.Bills.AttributionByPlan>({
    url: '/api/v1/bills/attribution/by-plan',
    method: 'get'
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

/** 风险看板查询参数 */
export interface RiskBoardQueryParams {
  /** 时点口径：now=即期 / expiry=到期 */
  horizon?: 'now' | 'expiry';
  /** IV 冲击倍数 */
  iv_mult?: number;
  /** 是否返回逐仓情景明细（保证金结构图用） */
  detail?: boolean;
}

/** 风险看板实时计算（GET /bills/risk-board，只读） */
export function fetchRiskBoard(params?: RiskBoardQueryParams) {
  return request<Api.Bills.RiskBoard>({
    url: '/api/v1/bills/risk-board',
    method: 'get',
    params
  });
}

/** 风险看板日终重算并落库（POST /bills/run/risk-board） */
export function runRiskBoard() {
  return request<Api.Bills.RiskBoardRunResult>({
    url: '/api/v1/bills/run/risk-board',
    method: 'post'
  });
}
