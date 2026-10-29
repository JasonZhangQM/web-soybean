<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton, NTag, NTooltip } from 'naive-ui';
import { useRouter } from 'vue-router';
import {
  fetchBills,
  batchImportBills,
  updateBill,
  deleteBill,
  fetchValueMonitors,
  fetchAllPlans,
  type BillUpdateParams
} from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { executeSync } from '@/utils/sync-feedback';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';
import BillNotePanel from './modules/BillNotePanel.vue';

defineOptions({ name: 'BillsListPage' });

const router = useRouter();
const billsStore = useBillsStore();
// 代码远程搜索（NAutoComplete，防抖 300ms）
const { symbolOptions: rawSymbolOptions, handleSymbolSearch, clearSymbolOptions } = useSymbolSearch();

// NAutoComplete 选中后 v-model = option.label，所以 label 必须设为纯 symbol
// display 字段保留下拉列表的富文本（symbol name (industry)），通过 renderLabel 渲染
const symbolOptions = computed(() =>
  rawSymbolOptions.value.map(o => ({ label: o.value, value: o.value, display: o.label }))
);

// 自定义下拉项渲染：显示 "symbol name (industry)"，但选中后 v-model 只拿到纯 symbol
function renderSymbolLabel(option: any) {
  return option.display || option.label;
}

const loading = ref(false);
// 导入专用 loading：与表格 loading 分离，避免导入过程中表格闪烁
const importLoading = ref(false);
const tableData = ref<Api.Bills.Bill[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

// 筛选参数：account/category 单选精确匹配，变更即搜索；
// keyword 为合并搜索框——代码与名称任一模糊命中即可（后端 OR），回车立即搜索、清空立即重搜；
// vm_symbol 按归属标的精确筛选（一条流水归属哪个标的由 (category, symbol) 决定，
// 见 bills_group_symbol；所以筛出来的是「这个标的名下的全部流水」）
const searchParams = reactive<{
  account?: string | null;
  category?: string | null;
  keyword?: string;
  vm_symbol?: string | null;
  plan_id?: number | null;
}>({});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 类别/账户下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());
const accountOptions = computed(() => billsStore.getAccountOptions());

// ---------------- 归属标的下拉候选（来源：估值监测） ----------------
// 归属值受控：PATCH /group-symbols/{id}/vm 会校验标的必须已在 irs_value_monitor 里，
// 所以这份列表覆盖了库里所有可能的 vm_symbol，不需要另开「已用值」接口。
const vmList = ref<Api.Irs.ValueMonitor[]>([]);
const vmOptions = computed(() =>
  vmList.value.map(v => ({ label: `${v.symbol} ${v.name ?? ''}`.trim(), value: v.symbol }))
);

async function loadVmOptions() {
  // 标的就那么几个（当前 9 个），一次取全
  const { data, error } = await fetchValueMonitors({ limit: 200 });
  if (!error && data) vmList.value = data.items;
}

async function fetchData() {
  loading.value = true;
  try {
    // 显式列出字段而不是展开 searchParams：会话记忆里可能残留旧版本字段（symbol/name），
    // 展开会把它们一并传给后端，导致筛选条件被隐藏地叠加
    const { data, error } = await fetchBills({
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      account: searchParams.account || undefined,
      category: searchParams.category || undefined,
      // 合并搜索框清空返回空串
      keyword: searchParams.keyword || undefined,
      vm_symbol: searchParams.vm_symbol || undefined,
      plan_id: searchParams.plan_id ?? undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (!error) {
      tableData.value = data.items;
      pagination.itemCount = data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.account = null;
  searchParams.category = null;
  searchParams.keyword = '';
  searchParams.vm_symbol = null;
  searchParams.plan_id = null;
  clearSymbolOptions();
  pagination.page = 1;
  fetchData();
}

/**
 * 合并搜索框输入变化：同步刷新代码候选下拉；清空时立即重新搜索
 * （输入过程中不搜索，避免每敲一个字就打一次接口，回车才搜）
 */
function handleKeywordChange(value: string | null) {
  const keyword = value ?? '';
  handleSymbolSearch(keyword);
  if (!keyword) handleSearch();
}

// 触发后端账单批量导入（executeSync 内置进度条/防重复/结果通知）
async function handleImport() {
  await executeSync(batchImportBills, importLoading, fetchData);
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  fetchData();
}

// ===== 编辑弹窗 =====

const editingId = ref<number | null>(null);
const showModal = ref(false);
// 笔记独立弹窗：想法 + 关联剧本，和「编辑账单」彻底分开——
// 账单保存是 PATCH 全字段宽口子，笔记是独立端点，两者混在一个弹窗容易被「保存」冲成 NULL
const showNoteModal = ref(false);
const noteRow = ref<Api.Bills.Bill | null>(null);
/** 笔记面板：保存逻辑在面板内，弹窗只负责把「保存」按钮接到它 */
const notePanelRef = ref<InstanceType<typeof BillNotePanel> | null>(null);
/** 剧本 id → 简称（前端聚合，bills 不跨模块查 irs 表；未加载到时回退「剧本 #id」） */
const planLabelMap = ref<Record<number, string>>({});
const planOptions = ref<{ label: string; value: number }[]>([]);
const submitLoading = ref(false);
const deleteLoading = ref(false);
const formRef = ref();

// 分组展开状态：默认只展开成交数据组
const expandedNames = ref<string[]>(['deal']);

// NInputNumber precision 映射
const PRECISION = {
  price: 4,
  amount: 2,
  fee_tax: 2,
  fees: 2,
  taxes: 2,
  fee_exec1: 2,
  fee_exec2: 2,
  fee_exec3: 2,
  fee_hand: 2,
  fee_sr: 2,
  fee_clear: 2,
  fee_reg: 2,
  fee_other: 2,
  premium: 2,
  cash: 2,
  vol: 0,
  balance: 0
};

// 编辑表单数据（全可选，null 表示不修改）
const formData = reactive<{
  trade_time: string | null;
  symbol: string;
  name: string;
  exec_type: string;
  category1: string;
  category: string;
  b_s: string | null;
  c_p: string | null;
  o_c: string | null;
  price: number | null;
  vol: number | null;
  amount: number | null;
  amount_act: number | null;
  balance: number | null;
  fee_tax: number | null;
  fees: number | null;
  taxes: number | null;
  fee_exec1: number | null;
  fee_exec2: number | null;
  fee_exec3: number | null;
  fee_hand: number | null;
  fee_sr: number | null;
  fee_clear: number | null;
  fee_reg: number | null;
  fee_other: number | null;
  premium: number | null;
  cash: number | null;
  id_exec: string | null;
  id_agree: string | null;
  currency: string;
  account_id: string | null;
  market: string | null;
  account: string;
}>({
  trade_time: null,
  symbol: '',
  name: '',
  exec_type: '',
  category1: '',
  category: '',
  b_s: null,
  c_p: null,
  o_c: null,
  price: null,
  vol: null,
  amount: null,
  amount_act: null,
  balance: null,
  fee_tax: null,
  fees: null,
  taxes: null,
  fee_exec1: null,
  fee_exec2: null,
  fee_exec3: null,
  fee_hand: null,
  fee_sr: null,
  fee_clear: null,
  fee_reg: null,
  fee_other: null,
  premium: null,
  cash: null,
  id_exec: null,
  id_agree: null,
  currency: '',
  account_id: null,
  market: null,
  account: ''
});

function resetForm() {
  Object.keys(formData).forEach(k => {
    const key = k as keyof typeof formData;
    formData[key] = (PRECISION[key as keyof typeof PRECISION] !== undefined ? null : '') as never;
  });
  formData.b_s = null;
  formData.c_p = null;
  formData.o_c = null;
  formData.balance = null;
  formData.fee_tax = null;
  formData.fees = null;
  formData.taxes = null;
  formData.fee_exec1 = null;
  formData.fee_exec2 = null;
  formData.fee_exec3 = null;
  formData.fee_hand = null;
  formData.fee_sr = null;
  formData.fee_clear = null;
  formData.fee_reg = null;
  formData.fee_other = null;
  formData.premium = null;
  formData.cash = null;
  formData.id_exec = null;
  formData.id_agree = null;
  formData.account_id = null;
  formData.market = null;
  formData.trade_time = null;
  expandedNames.value = ['deal'];
  formRef.value?.restoreValidation();
}

// Decimal 字符串安全转 number
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// 打开编辑弹窗：回填行数据
function handleEdit(row: Api.Bills.Bill) {
  resetForm();
  editingId.value = row.id;
  // trade_time 格式：去掉 'T' 换成空格，截取到秒
  formData.trade_time = row.trade_time ? row.trade_time.replace('T', ' ').slice(0, 19) : null;
  formData.symbol = row.symbol ?? '';
  formData.name = row.name ?? '';
  formData.exec_type = row.exec_type ?? '';
  formData.category1 = row.category1 ?? '';
  formData.category = row.category ?? '';
  formData.b_s = row.b_s ?? null;
  formData.c_p = row.c_p ?? null;
  formData.o_c = row.o_c ?? null;
  formData.price = toNum(row.price);
  formData.vol = toNum(row.vol);
  formData.amount = toNum(row.amount);
  formData.amount_act = toNum(row.amount_act);
  formData.balance = toNum(row.balance);
  formData.fee_tax = toNum(row.fee_tax);
  formData.fees = toNum(row.fees);
  formData.taxes = toNum(row.taxes);
  formData.fee_exec1 = toNum(row.fee_exec1);
  formData.fee_exec2 = toNum(row.fee_exec2);
  formData.fee_exec3 = toNum(row.fee_exec3);
  formData.fee_hand = toNum(row.fee_hand);
  formData.fee_sr = toNum(row.fee_sr);
  formData.fee_clear = toNum(row.fee_clear);
  formData.fee_reg = toNum(row.fee_reg);
  formData.fee_other = toNum(row.fee_other);
  formData.premium = toNum(row.premium);
  formData.cash = toNum(row.cash);
  formData.id_exec = row.id_exec ?? null;
  formData.id_agree = row.id_agree ?? null;
  formData.currency = row.currency ?? '';
  formData.account_id = row.account_id ?? null;
  formData.market = row.market ?? null;
  formData.account = row.account ?? '';
  showModal.value = true;
}

// 提交编辑
async function handleSubmit() {
  if (editingId.value === null) return;
  submitLoading.value = true;
  try {
    // 构造 payload：只传非空值（后端 None 表示不修改）
    const payload: BillUpdateParams = {};
    (Object.keys(formData) as Array<keyof typeof formData>).forEach(key => {
      const val = formData[key];
      if (val === null || val === '') return;
      if (val === undefined) return;
      (payload as any)[key] = val;
    });
    const { error } = await updateBill(editingId.value, payload);
    if (!error) {
      window.$message?.success('修改成功');
      showModal.value = false;
      resetForm();
      fetchData();
    }
  } finally {
    submitLoading.value = false;
  }
}

// 删除当前这一笔：后端只允许删该账户最后一笔（trade_time 最大）
async function handleDelete() {
  if (editingId.value === null) return;
  const idToDelete = editingId.value;
  const account = formData.account || '-';
  const symbol = formData.symbol || '-';
  const tradeTime = formData.trade_time || '-';

  window.$dialog?.warning({
    title: '确认删除这一笔账单？',
    content: `账户 ${account} / ${symbol} / ${tradeTime}。将同时删除对应的「账单收益」行，并把该组合标记为待重算。只能删除该账户最后一笔；删除后需重新导入或同步，汇总才会刷新。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deleteLoading.value = true;
      try {
        const { data, error } = await deleteBill(idToDelete);
        if (!error) {
          window.$message?.success(`删除成功，连带收益行 ${data?.deleted_profit ?? 0} 条`);
          showModal.value = false;
          resetForm();
          // 当前页只剩这一条时回退一页，避免删完停在空页
          if (tableData.value.length === 1 && pagination.page > 1) pagination.page -= 1;
          fetchData();
        }
      } finally {
        deleteLoading.value = false;
      }
    }
  });
}

function handleCancel() {
  showModal.value = false;
  resetForm();
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.Bill, key: string) {
  const val = (row as any)[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// ---------------- 归属标的 ----------------
/**
 * 可归属判定 —— 与后端 bills/constants.py::is_attachable 同一口径。
 * 纯粹按 category 判断：只有 TRADE_CATS 三类真交易行才谈得上归属标的。
 * 不可归属的 6 类（理财/融资融券/收益费用/出入金/-/cash）统一显示「—」，
 * 不是「未归属」——「未归属」= 应该有但还没选；「—」= 压根不参与归属。
 */
const TRADE_CATS = ['证券交易', '期货交易', '期权交易'];

const NON_ATTACHABLE_HINTS: Record<string, string> = {
  理财: '理财类（国债逆回购/OTC/TTB 等），不是证券交易',
  融资融券: '融资融券：融资行为本身，不归属任何标的',
  收益费用: '收益费用流水：利息/手续费，不归属任何标的',
  出入金: '出入金流水：资金进出，不归属任何标的',
  '-': '无代码操作（配股权证/申购配号等），不参与归属',
  cash: '现金行：资金头寸，不归属任何标的'
};

function isAttachable(category: string | undefined | null) {
  return category != null && TRADE_CATS.includes(category);
}

/** 跳标的档案页并自动开抽屉（该页读 ?vm=SYMBOL） */
function gotoValueMonitor(symbol: string) {
  router.push({ name: 'irs_value-monitors', query: { vm: symbol } });
}

function renderVmSymbol(row: Api.Bills.Bill) {
  // 不可归属类别：显示「—」，附 tooltip 说明原因
  if (!isAttachable(row.category)) {
    const hint = NON_ATTACHABLE_HINTS[row.category ?? ''] ?? '非交易类别，不参与标的归属';
    return h(NTooltip, null, {
      trigger: () => h('span', { class: 'text-gray-400', style: 'cursor: help' }, '—'),
      default: () => hint
    });
  }
  if (!row.vm_symbol) {
    return h('span', { class: 'text-gray-300' }, '未归属');
  }
  return h(
    NButton,
    { text: true, type: 'primary', size: 'tiny', onClick: () => gotoValueMonitor(row.vm_symbol as string) },
    { default: () => row.vm_symbol }
  );
}

// ---------------- 想法（首 30 字 + 全文 tooltip + 晚 N 天补写标记） ----------------
/**
 * 落笔比成交晚多少天：≥1 天才返回。
 *
 * 这是「事后补写」的唯一可算信号——文本看不出来，时间戳能看出来。
 */
function lateDaysAt(noteAt: string | null, tradeTime: string | null) {
  if (!noteAt || !tradeTime) return null;
  const a = new Date(noteAt.replace(' ', 'T')).getTime();
  const b = new Date(tradeTime.replace(' ', 'T')).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.floor((a - b) / 86400000);
  return days >= 1 ? days : null;
}

/** 打开独立的「记一笔」弹窗（不改账单字段） */
function openNote(row: Api.Bills.Bill) {
  noteRow.value = row;
  showNoteModal.value = true;
}

/** 弹窗内「保存」：想法与剧本一次性提交，成功即关闭 */
async function handleNoteSave() {
  const ok = await notePanelRef.value?.save();
  if (ok) showNoteModal.value = false;
}

function renderIdea(row: Api.Bills.Bill) {
  const txt = row.note_idea;
  if (!txt) {
    return h(
      NButton,
      { text: true, size: 'tiny', class: 'opacity-60', onClick: () => openNote(row) },
      { default: () => '写想法' }
    );
  }
  const flat = txt.replace(/\s*\n\s*/g, ' ').trim();
  const late = lateDaysAt(row.note_idea_at, row.trade_time);
  // 单元格只放一行，超出用 CSS 省略号；完整正文 + 落笔时间放 tooltip
  return h(
    NTooltip,
    { trigger: 'hover', placement: 'bottom-start', style: 'max-width: 460px' },
    {
      trigger: () =>
        h(
          'div',
          {
            class: 'flex cursor-pointer items-center gap-4px overflow-hidden whitespace-nowrap',
            onClick: () => openNote(row)
          },
          [
            h('span', { class: 'min-w-0 flex-1 overflow-hidden text-ellipsis text-12px' }, flat),
            late !== null
              ? h(
                  NTag,
                  {
                    size: 'tiny',
                    type: late >= 7 ? 'warning' : 'default',
                    bordered: false,
                    class: 'shrink-0'
                  },
                  { default: () => `+${late}d` }
                )
              : null
          ]
        ),
      default: () =>
        h('div', { style: 'white-space: pre-wrap' }, [
          flat,
          row.note_idea_at ? `\n落笔 ${row.note_idea_at.replace('T', ' ').slice(0, 16)}` : ''
        ])
    }
  );
}

/** 剧本列：显示关联剧本的「代码 买卖开平」，悬停出完整标题；点击同样进入「记一笔」 */
function renderPlan(row: Api.Bills.Bill) {
  if (row.plan_id == null) {
    return h(
      NButton,
      { text: true, size: 'tiny', class: 'opacity-60', onClick: () => openNote(row) },
      { default: () => '未关联' }
    );
  }
  const full = planLabelMap.value[row.plan_id];
  const short = full ?? `剧本 #${row.plan_id}`;
  return h(
    NTooltip,
    { trigger: 'hover', placement: 'bottom-start', style: 'max-width: 460px' },
    {
      trigger: () =>
        h(
          'div',
          {
            class: 'cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis text-12px',
            onClick: () => openNote(row)
          },
          short
        ),
      default: () => h('div', { style: 'white-space: pre-wrap' }, `剧本 #${row.plan_id}\n${full ?? '（剧本已不存在）'}`)
    }
  );
}

// 列宽按「实测最长内容 + 内边距」定：width 小于内容宽时 table-layout:fixed 会把文本折成两行。
// 定宽依据（bills_bill 2917 行实测最长显示宽度，中文按 2 计）：
// 代码 19（CFFEX.HO2410-C-2700）、名称 19（创业板ETF购12月2950）、交易时间 19 字符、
// 分类 8（理财申购）、买/卖等 4、归属标的 11（SHSE.000300）、发生额 11（-1000000.00）。
const columns = [
  // 交易时间截取前 19 位（去掉毫秒/时区部分），点击编辑
  {
    title: '交易时间',
    key: 'trade_time',
    width: 180,
    render: (row: Api.Bills.Bill) =>
      h(
        NButton,
        { text: true, type: 'primary', onClick: () => handleEdit(row) },
        { default: () => row.trade_time?.slice(0, 19).replace('T', ' ') ?? '-' }
      )
  },
  {
    title: '代码',
    key: 'symbol',
    width: 185,
    render: (row: Api.Bills.Bill) => h('span', { style: 'user-select: text' }, row.symbol)
  },
  { title: '名称', key: 'name', width: 185 },
  // 归属标的、剧本、想法放在左侧：这几列才是本页的「决策载体」，右侧留给行情数字
  { title: '归属标的', key: 'vm_symbol', width: 130, render: (row: Api.Bills.Bill) => renderVmSymbol(row) },
  { title: '剧本', key: 'plan_id', width: 130, render: (row: Api.Bills.Bill) => renderPlan(row) },
  { title: '想法', key: 'note_idea', width: 180, render: (row: Api.Bills.Bill) => renderIdea(row) },
  { title: '总分类', key: 'category', width: 90 },
  { title: '一级分类', key: 'category1', width: 90 },
  { title: '买/卖', key: 'b_s', width: 70 },
  { title: '沽/购', key: 'c_p', width: 70 },
  { title: '开/平', key: 'o_c', width: 70 },
  { title: '成交价', key: 'price', width: 100, render: (row: Api.Bills.Bill) => Number(row.price).toFixed(4) },
  { title: '成交量', key: 'vol', width: 70 },
  { title: '成交额', key: 'amount', width: 120, render: (row: Api.Bills.Bill) => Number(row.amount).toFixed(2) },
  {
    title: '发生额',
    key: 'amount_act',
    width: 130,
    render: (row: Api.Bills.Bill) => Number(row.amount_act).toFixed(2)
  },
  { title: '税费合计', key: 'fee_tax', width: 90, render: (row: Api.Bills.Bill) => renderAmount(row, 'fee_tax') },
  { title: '账户', key: 'account', width: 70 }
];

// 横向滚动宽度 = 各列宽之和：scroll-x 必须 ≥ 该值，小于它会反向压缩列宽、把内容挤成两行
const scrollX = columns.reduce((sum, col) => sum + (col.width as number), 0);

/** 拉取剧本简称用于列表展示；失败不影响页面，只是回退成「剧本 #id」 */
async function loadPlanLabels() {
  const { data, error } = await fetchAllPlans();
  if (error || !data) return;
  const map: Record<number, string> = {};
  const opts: { label: string; value: number }[] = [];
  for (const p of data) {
    map[p.id] = `${p.trade_symbol} ${p.b_s}${p.o_c || ''}`;
    opts.push({ label: map[p.id], value: p.id });
  }
  planLabelMap.value = map;
  planOptions.value = opts;
}

onMounted(() => {
  fetchData();
  loadVmOptions();
  loadPlanLabels();
  // 确保类别/账户列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
  billsStore.loadAccounts();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="账户">
          <NSelect
            v-model:value="searchParams.account"
            :options="accountOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="类别">
          <NSelect
            v-model:value="searchParams.category"
            :options="categoryOptions"
            clearable
            placeholder="全部"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="归属标的">
          <NSelect
            v-model:value="searchParams.vm_symbol"
            :options="vmOptions"
            clearable
            filterable
            placeholder="全部"
            style="width: 200px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="剧本">
          <NSelect
            v-model:value="searchParams.plan_id"
            :options="planOptions"
            clearable
            filterable
            placeholder="全部"
            style="width: 170px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="代码/名称">
          <NAutoComplete
            v-model:value="searchParams.keyword"
            :options="symbolOptions"
            :render-label="renderSymbolLabel"
            clearable
            placeholder="代码或名称，回车搜索"
            style="width: 260px"
            @update:value="handleKeywordChange"
            @keyup.enter="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton :loading="importLoading" @click="handleImport">导入</NButton>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :scroll-x="scrollX"
        table-layout="fixed"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- ===== 编辑弹窗 ===== -->
    <NModal v-model:show="showModal" preset="card" title="编辑账单" class="w-720px" :mask-closable="false">
      <NForm ref="formRef" :model="formData" label-placement="left" label-width="100px">
        <!-- 基本信息 -->
        <NCollapse v-model:expanded-names="expandedNames" class="mt-8px">
          <NCollapseItem title="基本信息" name="basic">
            <NFormItem label="交易时间">
              <NDatePicker
                v-model:formatted-value="formData.trade_time"
                type="datetime"
                value-format="yyyy-MM-dd HH:mm:ss"
                class="w-full"
              />
            </NFormItem>
            <NFormItem label="代码">
              <NInput v-model:value="formData.symbol" />
            </NFormItem>
            <NFormItem label="名称">
              <NInput v-model:value="formData.name" />
            </NFormItem>
            <NFormItem label="操作类型">
              <NInput v-model:value="formData.exec_type" />
            </NFormItem>
            <NFormItem label="一级分类">
              <NInput v-model:value="formData.category1" />
            </NFormItem>
            <NFormItem label="总分类">
              <NInput v-model:value="formData.category" />
            </NFormItem>
            <NFormItem label="买/卖">
              <NInput v-model:value="formData.b_s" />
            </NFormItem>
            <NFormItem label="沽/购">
              <NInput v-model:value="formData.c_p" />
            </NFormItem>
            <NFormItem label="开/平">
              <NInput v-model:value="formData.o_c" />
            </NFormItem>
          </NCollapseItem>

          <!-- 成交数据（默认展开） -->
          <NCollapseItem title="成交数据" name="deal">
            <NFormItem label="成交价">
              <NInputNumber v-model:value="formData.price" :precision="4" :step="0.0001" class="w-full" />
            </NFormItem>
            <NFormItem label="成交量">
              <NInputNumber v-model:value="formData.vol" :precision="0" :step="1" class="w-full" />
            </NFormItem>
            <NFormItem label="成交额">
              <NInputNumber v-model:value="formData.amount" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="发生额">
              <NInputNumber v-model:value="formData.amount_act" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="余额">
              <NInputNumber v-model:value="formData.balance" :precision="0" :step="1" class="w-full" />
            </NFormItem>
          </NCollapseItem>

          <!-- 费用明细 -->
          <NCollapseItem title="费用明细" name="fee">
            <NFormItem label="税费合计">
              <NInputNumber v-model:value="formData.fee_tax" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="手续费">
              <NInputNumber v-model:value="formData.fees" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="印花税">
              <NInputNumber v-model:value="formData.taxes" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="过户费">
              <NInputNumber v-model:value="formData.fee_exec1" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="交易过户费">
              <NInputNumber v-model:value="formData.fee_exec2" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="行权过户费">
              <NInputNumber v-model:value="formData.fee_exec3" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="经手费">
              <NInputNumber v-model:value="formData.fee_hand" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="证管费">
              <NInputNumber v-model:value="formData.fee_sr" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="清算费">
              <NInputNumber v-model:value="formData.fee_clear" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="交易规费">
              <NInputNumber v-model:value="formData.fee_reg" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="其他费用">
              <NInputNumber v-model:value="formData.fee_other" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="权利金收支">
              <NInputNumber v-model:value="formData.premium" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
            <NFormItem label="资金余额">
              <NInputNumber v-model:value="formData.cash" :precision="2" :step="0.01" class="w-full" />
            </NFormItem>
          </NCollapseItem>

          <!-- 编号与账户信息 -->
          <NCollapseItem title="编号与账户信息" name="account">
            <NFormItem label="成交编号">
              <NInput v-model:value="formData.id_exec" />
            </NFormItem>
            <NFormItem label="流水号">
              <NInput v-model:value="formData.id_agree" />
            </NFormItem>
            <NFormItem label="币种">
              <NInput v-model:value="formData.currency" />
            </NFormItem>
            <NFormItem label="账号">
              <NInput v-model:value="formData.account_id" />
            </NFormItem>
            <NFormItem label="市场">
              <NInput v-model:value="formData.market" />
            </NFormItem>
            <NFormItem label="账户">
              <NInput v-model:value="formData.account" />
            </NFormItem>
          </NCollapseItem>
        </NCollapse>
      </NForm>
      <template #footer>
        <NSpace justify="space-between" align="center">
          <NButton type="error" ghost :loading="deleteLoading" @click="handleDelete">删除</NButton>
          <NSpace>
            <NButton @click="handleCancel">取消</NButton>
            <NButton :loading="submitLoading" @click="handleSubmit">保存</NButton>
          </NSpace>
        </NSpace>
      </template>
    </NModal>

    <!-- 记一笔：想法 + 关联剧本（独立弹窗，只走笔记端点，不碰账单字段） -->
    <NModal
      v-model:show="showNoteModal"
      preset="card"
      title="记一笔：想法与剧本"
      class="w-640px"
      :mask-closable="false"
      @after-leave="fetchData"
    >
      <div v-if="noteRow" class="mb-12px text-12px text-gray-500">
        {{ noteRow.trade_time?.slice(0, 19).replace('T', ' ') ?? '-' }}
        · {{ noteRow.name }}（{{ noteRow.symbol }}） · {{ noteRow.b_s }}{{ noteRow.o_c ?? '' }}
        <span v-if="noteRow.vm_symbol">· 归属 {{ noteRow.vm_symbol }}</span>
      </div>
      <BillNotePanel
        ref="notePanelRef"
        :key="`note-${noteRow?.id ?? 0}`"
        :bill-id="noteRow?.id ?? null"
        :trade-time="noteRow?.trade_time ?? null"
      />
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showNoteModal = false">关闭</NButton>
          <NButton type="primary" @click="handleNoteSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
/*
 * 单元格一律不折行：列宽已按实测最长内容放宽，超出容器的部分由表格横向滚动接管
 * （scroll-x = 列宽之和）。
 *
 * 为什么必须 table-layout="fixed"：Naive 默认 table-layout 是 auto，列的 width 只是
 * 「建议值」，内容一长就会把列撑开——表现为「剧本/想法列设了 180 却没变窄」。
 * 固定布局后 width 才是硬约束，超出部分由单元格内的 overflow-hidden 裁掉。
 *
 * 为什么必须用 :deep()：NDataTable 的 th/td 由子组件渲染，scoped 属性加不到它们身上，
 * 直接写 .n-data-table-td 无效且不报错，表现为「改了没反应」。
 *
 * 为什么不用列级 ellipsis：它会附带列内文本省略样式，但本列已自行截断 + tooltip；
 * 其余短字段靠固定宽度即可完整显示。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
