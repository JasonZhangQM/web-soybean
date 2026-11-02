<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { NButton, NSelect, NTag, NTooltip } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchGroupSymbols,
  fetchGroupSymbolsCoverage,
  fetchUnderlyingMonitors,
  syncGroup,
  updateGroupSymbolUnderlying
} from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsGroupSymbolsPage' });

const route = useRoute();
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
// 同步专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Bills.GroupSymbol[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

/**
 * 筛选参数：
 * - category 单选精确匹配
 * - symbol NAutoComplete（可直接输入后点搜索）
 * - pos_state 二选（holding 持仓中 / closed 已平仓），留空 = 全部，默认 holding
 * - mapped 归属筛选：null=全部 / 'yes'=已归属 / 'no'=未归属（**仅可归属的交易行**里既无
 *   underlying_symbol 也不同代码的行，即"还能补多少"的可操作清单；资金流水行不计入）
 * - underlying_symbol 归属标的：精确筛某个标的名下的全部合约行（如 SHSE.000300 下的期权+ETF+期货）。
 *   与 mapped 互斥（mapped=no + 具体标的恒为空集），选一个会清掉另一个。
 *
 * v3 起本页没有 theme / has_note：主题与笔记全部迁到标的档案（/irs/underlying-monitors）；
 * 人工列只剩 underlying_symbol（归属标的），编辑在抽屉（点击代码）；风险敞口为联动
 * 派生列（人工值设在 Group 页，按标的自动汇总），本页只读。
 *
 * 「可归属」= 交易类（证券/期货/期权）且 symbol 不是资金流水占位代码
 * （RZRQ/CRJ/SYFY/cash）；理财逆回购按分类一并排除。口径见后端
 * `app/bills/constants.py::is_attachable`，前端 `isAttachable()` 必须与之同步。
 */
const searchParams = reactive<{
  category?: string | null;
  symbol?: string;
  pos_state: 'holding' | 'closed' | null;
  mapped: 'yes' | 'no' | null;
  underlying_symbol: string | null;
}>({
  pos_state: 'holding',
  mapped: null,
  underlying_symbol: null
});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 类别下拉选项（从全局 store 获取）
const categoryOptions = computed(() => billsStore.getCategoryOptions());

// 持仓下拉选项：无「全部」项，清空即全部（与 category 的 NSelect 同一交互）
const posStateOptions = [
  { label: '持仓中', value: 'holding' },
  { label: '已平仓', value: 'closed' }
];

// 归属下拉：清空即全部
const mappedOptions = [
  { label: '已归属', value: 'yes' },
  { label: '未归属', value: 'no' }
];

// 后端 pos_state 带 pattern 校验（仅 holding|closed）：null = 全部（不传），
// 顺带兜住 usePageState 可能恢复的旧三态残值 'all'
function toPosStateParam(val: string | null) {
  return val === 'holding' || val === 'closed' ? val : undefined;
}

// ---------------- 归属标的候选（来源：标的监测列表，8 个标的） ----------------
const umList = ref<Api.Irs.UnderlyingMonitor[]>([]);
const umOptions = computed(() =>
  umList.value.map(v => ({ label: `${v.symbol} ${v.name ?? ''}`.trim(), value: v.symbol }))
);
// symbol -> 名称，用于「已归属 XXX」提示
const umNameMap = computed(() => {
  const m: Record<string, string> = {};
  for (const v of umList.value) m[v.symbol] = v.name ?? '';
  return m;
});

async function loadUnderlyingOptions() {
  // 标的就那么几个（当前 8 个），一次取全，不必分页
  const { data, error } = await fetchUnderlyingMonitors({ limit: 200 });
  if (!error && data) umList.value = data.items;
}

// ---------------- 归属覆盖计数（顶部「还有多少行没选」） ----------------
const coverage = ref<Api.Bills.GroupSymbolCoverage>({ mapped: 0, unmapped: 0, excluded: 0, total: 0 });
const coverageLoading = ref(false);

async function fetchCoverage() {
  coverageLoading.value = true;
  try {
    const { data, error } = await fetchGroupSymbolsCoverage();
    if (!error && data) coverage.value = data;
  } finally {
    coverageLoading.value = false;
  }
}

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGroupSymbols({
      ...searchParams,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      category: searchParams.category || undefined,
      // NAutoComplete 清空返回空串，转为 undefined 避免传给后端
      symbol: searchParams.symbol || undefined,
      // 清空（null）不传，交给后端不过滤 = 全部
      pos_state: toPosStateParam(searchParams.pos_state),
      mapped: searchParams.mapped || undefined,
      // NSelect 清空返回 null，转为 undefined 避免传给后端
      underlying_symbol: searchParams.underlying_symbol || undefined,
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

/**
 * 搜索触发策略（与 /bds/index-valuation 一致）：
 * - 类别 / 持仓 / 归属：值一变就搜（模板里直接挂 @update:value → handleSearch），不必点按钮
 * - 代码：输入过程中只在本地拉候选（handleSymbolSearch 防抖 300ms），
 *   必须点「搜索」才发请求，避免每敲一个字符打一次库
 * 全部入口都先回到第 1 页，防止停在第 N 页时新条件无数据
 */
function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.category = null;
  searchParams.symbol = '';
  searchParams.pos_state = 'holding';
  searchParams.mapped = null;
  searchParams.underlying_symbol = null;
  clearSymbolOptions();
  fetchData();
}

/**
 * 归属 / 归属标的 互斥：后端是 AND，`mapped=no` 配任一具体标的恒为空集，
 * 不清理的话用户会看到「0 条」以为数据没了。选哪个就清掉另一个。
 */
function handleMappedChange(val: 'yes' | 'no' | null) {
  searchParams.mapped = val;
  if (val) searchParams.underlying_symbol = null;
  handleSearch();
}

function handleUnderlyingSymbolChange(val: string | null) {
  searchParams.underlying_symbol = val;
  if (val) searchParams.mapped = null;
  handleSearch();
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

async function handleSync() {
  // 行情同步会重算派生列，顺手刷一次覆盖计数（underlying_symbol 不受影响，见 group_summary 注释）
  await executeSync(syncGroup, syncLoading, async () => {
    await Promise.all([fetchData(), fetchCoverage()]);
  });
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.GroupSymbol, key: keyof Api.Bills.GroupSymbol) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
}

// 数值渲染：toFixed 统一精度后去掉小数末尾的 0 与孤立小数点
// （4800.00 -> 4800、2.7500 -> 2.75、3.0000 -> 3）；金额列仍走 renderAmount 保留两位
function renderTrimmed(val: number | string | null | undefined, precision: number) {
  return val != null
    ? Number(val)
        .toFixed(precision)
        .replace(/\.?0+$/, '')
    : '-';
}

// 当前页三列盈亏汇总（前端计算，null 值跳过不计）
const plSummary = computed(() => {
  let pfTotal = 0;
  let plAll = 0;
  let pflAll = 0;
  for (const row of tableData.value) {
    if (row.pf_total != null) pfTotal += Number(row.pf_total);
    if (row.pl_all != null) plAll += Number(row.pl_all);
    if (row.pfl_all != null) pflAll += Number(row.pfl_all);
  }
  return { pfTotal, plAll, pflAll };
});

// 分页栏左侧前缀：保留总条数，并展示三列汇总（prefix 渲染在分页栏最左侧，天然左对齐）
pagination.prefix = () =>
  h('div', { class: 'flex items-center gap-16px' }, [
    h('span', null, `浮动盈亏: ${plSummary.value.pfTotal.toFixed(2)}`),
    h('span', null, `平仓盈亏: ${plSummary.value.plAll.toFixed(2)}`),
    h('span', null, `盈亏合计: ${plSummary.value.pflAll.toFixed(2)}`),
    h('span', null, `共 ${pagination.itemCount} 条`)
  ]);

// 盈亏合计渲染：保留两位小数
function renderRate(row: Api.Bills.GroupSymbol) {
  const val = row.pfl_all;
  return val != null ? Number(val).toFixed(2) : '-';
}

// 最新价：最多 4 位小数，去掉末尾 0（2.7500 -> 2.75），null 显示 '-'
function renderPrice(row: Api.Bills.GroupSymbol) {
  return renderTrimmed(row.price, 4);
}

// ---------------- 归属标的（列内只读展示，编辑统一走抽屉） ----------------
/**
 * 可归属判定 —— 与后端 `app/bills/constants.py::is_attachable` 同一口径。
 *
 * 纯粹按交易类别（category）判断。只有三类真交易行才谈得上
 * 「这笔交易围绕哪个标的」：证券交易、期货交易、期权交易。
 *
 * 不可归属的类别共 6 类：理财、融资融券、收益费用、出入金、'-'、cash。
 * 之前版本用 category + symbol 双重判断，但实际数据中这些不可归属类别的
 * symbol 不会出现在交易类别里，symbol 检查是冗余的。
 *
 * ⚠️ 改动这里必须同步后端 constants.py，否则前端能选、后端 400，表现为「选了弹回」。
 */
const TRADE_CATS = ['证券交易', '期货交易', '期权交易'];

function isAttachable(row: Api.Bills.GroupSymbol) {
  return TRADE_CATS.includes(row.category);
}

// 不可归属行的说明文案（按 category 给具体原因，比统一一句「不参与归属」有用）
const NON_ATTACHABLE_HINTS: Record<string, string> = {
  理财: '理财类（国债逆回购/OTC/TTB 等），不是证券交易',
  融资融券: '融资融券：融资行为本身，不归属任何标的',
  收益费用: '收益费用流水：利息/手续费，不归属任何标的',
  出入金: '出入金流水：资金进出，不归属任何标的',
  '-': '无代码操作（配股权证/申购配号等），不参与归属',
  cash: '现金行：资金头寸，不归属任何标的'
};

function nonAttachableHint(row: Api.Bills.GroupSymbol) {
  return NON_ATTACHABLE_HINTS[row.category] ?? `${row.category}：非交易类别，不参与标的归属`;
}

// 归属列渲染（列内只读展示，编辑统一走抽屉）：
// 不可归属 ⇒ 「—」（附原因，不是漏配）；未归属 ⇒ 灰字；
// 已归属 ⇒ 「代码 名称」链接，跳标的监测页 ?um=SYMBOL 自动开标的档案抽屉
// （对端 openFromQuery 消费即摘除参数，不会污染标签 fullPath 反复弹抽屉）。
// 用 span 而不是 NButton：与代码列同理由——naive-ui 按钮样式带 user-select:none，文本没法选中复制
function renderUnderlyingSymbol(row: Api.Bills.GroupSymbol) {
  if (!isAttachable(row)) {
    return h(NTooltip, null, {
      trigger: () => h('span', { class: 'text-gray-400', style: 'cursor: help' }, '—'),
      default: () => nonAttachableHint(row)
    });
  }
  if (!row.underlying_symbol) {
    return h('span', { class: 'text-gray-300' }, '未归属');
  }
  const nm = umNameMap.value[row.underlying_symbol] ?? '';
  const um = row.underlying_symbol;
  return h(
    'span',
    {
      class: 'text-primary hover:underline cursor-pointer whitespace-nowrap',
      style: 'user-select: text',
      onClick: () => router.push({ name: 'irs_underlying-monitors', query: { um } })
    },
    `${um} ${nm}`.trim()
  );
}

// ---------------- 合约行编辑抽屉（归属标的，GroupSymbol 唯一人工列） ----------------
/**
 * 代码列点击入口的落点。后端 PATCH /um 只写 underlying_symbol 列（白名单），
 * 整体保存语义：清空下拉 = 清空归属（null）。
 * 风险敞口的人工设置已上移到 Group 页（账户×分类×代码粒度），本表同名列
 * 由后端联动汇总维护，此抽屉只读展示。
 */
const metaDrawerShow = ref(false);
const metaRow = ref<Api.Bills.GroupSymbol | null>(null);
const metaForm = reactive<{ underlying_symbol: string | null }>({ underlying_symbol: null });
const metaSaving = ref(false);

function openMetaDrawer(row: Api.Bills.GroupSymbol) {
  metaRow.value = row;
  metaForm.underlying_symbol = row.underlying_symbol ?? null;
  metaDrawerShow.value = true;
}

async function handleMetaSave() {
  const row = metaRow.value;
  if (!row) return;
  metaSaving.value = true;
  try {
    const { data, error } = await updateGroupSymbolUnderlying(row.id, {
      underlying_symbol: metaForm.underlying_symbol || null
    });
    if (!error) {
      // 只回写人工列，派生列保持本屏数据，无需整行重取
      row.underlying_symbol = data?.underlying_symbol ?? null;
      window.$message?.success('已保存');
      metaDrawerShow.value = false;
      // 归属变化会改变覆盖计数
      fetchCoverage();
    }
  } finally {
    metaSaving.value = false;
  }
}

const columns = [
  {
    // 代码即编辑入口：点击直接弹出左侧抽屉，维护归属标的（唯一人工列）。
    // 不折行：19 字符的最长合约代码（如 CFFEX.IO2611-P-4000）要能一行显示。
    // ⚠️ 文本用 span 而不是 NButton：naive-ui 按钮样式带 user-select:none，代码没法选中复制
    title: '代码',
    key: 'symbol',
    width: 230,
    render: (row: Api.Bills.GroupSymbol) =>
      h(
        'span',
        {
          class: 'text-primary hover:underline cursor-pointer whitespace-nowrap',
          style: 'user-select: text',
          onClick: () => openMetaDrawer(row)
        },
        row.symbol
      )
  },
  { title: '交易分类', key: 'category', width: 80 },
  {
    // 归属标的：合约 → 标的的唯一桥梁。归属后该合约的全部成交都归到这个标的名下；
    // 列内只读展示，编辑统一在抽屉（点击代码）设置
    title: '归属标的',
    key: 'underlying_symbol',
    width: 200,
    render: (row: Api.Bills.GroupSymbol) => renderUnderlyingSymbol(row)
  },
  { title: '交易次数', key: 'count', width: 80, align: 'right' as const },
  {
    // 持仓量：去掉 toFixed(2) 的末尾 0（4800.00 -> 4800），null 显示 '-'
    title: '持仓量',
    key: 'p_total',
    width: 100,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderTrimmed(row.p_total, 2)
  },
  {
    title: '最新价',
    key: 'price',
    width: 100,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderPrice(row)
  },
  {
    // 乘数：期货/期权合约每单位价值（如沪金=1000、IO=300）；证券类为 1，null 显示 '-'。
    // 整数原样展示——不能用 renderTrimmed：precision=0 时无小数点，正则会误删末尾 0（300 -> 3）
    title: '乘数',
    key: 'multiplier',
    width: 70,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => (row.multiplier != null ? String(row.multiplier) : '-')
  },
  {
    // 行权价：仅期权交易行有值（后端经 bds_option_config → bds_option_info 查得），
    // 未登记同步清单的合约 / 非期权类别显示 '-'
    title: '行权价',
    key: 'strike',
    width: 90,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderTrimmed(row.strike, 4)
  },
  {
    title: '持仓成本',
    key: 'cost_total',
    // 130：最长 13 字符（-1,311,947.81）右对齐时不留折行余地
    width: 130,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'cost_total')
  },
  {
    // 风险敞口（联动派生，只读）：人工值设在 Group 页（账户×分类×代码），
    // 后端保存时按 (category, symbol) 汇总刷回本表
    title: '风险敞口',
    key: 'risk_exposure',
    width: 120,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'risk_exposure')
  },
  {
    title: '当前市值',
    key: 'value_total',
    // 130：同上，最长 13 字符
    width: 130,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'value_total')
  },
  {
    title: '浮动盈亏',
    key: 'pf_total',
    width: 120,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'pf_total')
  },
  {
    title: '平仓盈亏',
    key: 'pl_all',
    width: 120,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'pl_all')
  },
  { title: '盈亏合计', key: 'pfl_all', width: 100, align: 'right' as const, render: renderRate }
];

// 横向滚动宽度 = 各列宽之和：scroll-x 小于该值会压缩列宽，把代码列挤成两行
const scrollX = columns.reduce((sum, col) => sum + (col.width as number), 0);

// 顶部「未归属」可点击：直接筛出可操作清单
function filterUnmapped() {
  searchParams.mapped = 'no';
  // 未归属清单必然不含具体标的，清了才不会 AND 成空集
  searchParams.underlying_symbol = null;
  handleSearch();
}

onMounted(async () => {
  // 从标的档案页「去合约页维护归属」跳进来时带 ?symbol=xxx：
  // 精确筛该合约，并把「持仓」清空（否则默认只看持仓中，已平仓的合约行会看不见）
  const qs = route.query.symbol;
  if (typeof qs === 'string' && qs) {
    searchParams.symbol = qs;
    searchParams.pos_state = null;
    pagination.page = 1;
  }
  fetchData();
  fetchCoverage();
  loadUnderlyingOptions();
  // 确保类别列表已加载（全局 store 会自动去重）
  billsStore.loadCategories();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
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
        <NFormItem label="持仓">
          <NSelect
            v-model:value="searchParams.pos_state"
            :options="posStateOptions"
            clearable
            placeholder="全部"
            style="width: 120px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="归属">
          <NSelect
            v-model:value="searchParams.mapped"
            :options="mappedOptions"
            clearable
            placeholder="全部"
            style="width: 120px"
            @update:value="handleMappedChange"
          />
        </NFormItem>
        <NFormItem label="归属标的">
          <NSelect
            v-model:value="searchParams.underlying_symbol"
            :options="umOptions"
            clearable
            filterable
            placeholder="全部"
            style="width: 200px"
            @update:value="handleUnderlyingSymbolChange"
          />
        </NFormItem>
        <NFormItem label="代码/名称">
          <NAutoComplete
            v-model:value="searchParams.symbol"
            :options="symbolOptions"
            :render-label="renderSymbolLabel"
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 200px"
            @update:value="handleSymbolSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton :loading="syncLoading" @click="handleSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            行情
          </NButton>
        </NFormItem>
      </NForm>

      <!--
        合约归属说明行（对齐 /bds/option-info：搜索卡内 NForm 下方 12px 灰字）。
        「未归属」标签可点击：直接筛出可操作清单。
      -->
      <div class="mt-8px flex flex-wrap items-center gap-8px text-12px" style="color: #999">
        <span>合约归属</span>
        <NTag size="small" type="success" :bordered="false">已归属 {{ coverage.mapped }}</NTag>
        <NTag
          size="small"
          :type="coverage.unmapped > 0 ? 'warning' : 'default'"
          :bordered="false"
          style="cursor: pointer"
          @click="filterUnmapped"
        >
          未归属 {{ coverage.unmapped }}
        </NTag>
        <span>
          资金流水行 {{ coverage.excluded }} 行（RZRQ/CRJ/SYFY/cash/理财）不参与归属； 共 {{ coverage.total }} 行
        </span>
      </div>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :scroll-x="scrollX"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 合约行编辑抽屉（点击代码列打开）：归属标的（唯一人工列） -->
    <NDrawer v-model:show="metaDrawerShow" placement="left" width="440px" :mask-closable="false">
      <NDrawerContent :title="metaRow ? `编辑：${metaRow.symbol}` : '编辑合约行'" closable>
        <NForm label-placement="left" label-width="90px" :show-feedback="false" class="flex flex-col gap-16px">
          <NFormItem label="归属标的">
            <NSelect
              v-model:value="metaForm.underlying_symbol"
              :options="umOptions"
              clearable
              filterable
              placeholder="未归属"
              :disabled="metaRow ? !isAttachable(metaRow) : false"
            />
          </NFormItem>
          <div v-if="metaRow && !isAttachable(metaRow)" class="text-12px" style="color: #999; padding-left: 90px">
            {{ nonAttachableHint(metaRow) }}
          </div>
          <div class="text-12px" style="color: #999; padding-left: 90px">
            风险敞口不再在此维护：请到「账户持仓」页（Group，按账户×分类×代码）设置， 保存后自动按标的 /
            账户汇总刷新本页与账户汇总。
          </div>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="metaDrawerShow = false">取消</NButton>
            <NButton type="primary" :loading="metaSaving" @click="handleMetaSave">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
