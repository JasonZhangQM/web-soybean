<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { NSelect, NTag, NTooltip } from 'naive-ui';
import { useRoute } from 'vue-router';
import {
  fetchGroupSymbols,
  fetchGroupSymbolsCoverage,
  fetchValueMonitors,
  syncGroup,
  updateGroupSymbolVm
} from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsGroupSymbolsPage' });

const route = useRoute();
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
 *   vm_symbol 也不同代码的行，即"还能补多少"的可操作清单；资金流水行不计入）
 * - vm_symbol 归属标的：精确筛某个标的名下的全部合约行（如 SHSE.000300 下的期权+ETF+期货）。
 *   与 mapped 互斥（mapped=no + 具体标的恒为空集），选一个会清掉另一个。
 *
 * v3 起本页没有 theme / has_note：主题与笔记全部迁到标的档案（/irs/value-monitors），
 * 本表唯一的人工列是 vm_symbol。
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
  vm_symbol: string | null;
}>({
  pos_state: 'holding',
  mapped: null,
  vm_symbol: null
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

// ---------------- 归属标的候选（来源：估值监测列表，8 个标的） ----------------
const vmList = ref<Api.Irs.ValueMonitor[]>([]);
const vmOptions = computed(() =>
  vmList.value.map(v => ({ label: `${v.symbol} ${v.name ?? ''}`.trim(), value: v.symbol }))
);
// symbol -> 名称，用于「已归属 XXX」提示
const vmNameMap = computed(() => {
  const m: Record<string, string> = {};
  for (const v of vmList.value) m[v.symbol] = v.name ?? '';
  return m;
});

async function loadVmOptions() {
  // 标的就那么几个（当前 8 个），一次取全，不必分页
  const { data, error } = await fetchValueMonitors({ limit: 200 });
  if (!error && data) vmList.value = data.items;
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
      vm_symbol: searchParams.vm_symbol || undefined,
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
  searchParams.vm_symbol = null;
  clearSymbolOptions();
  fetchData();
}

/**
 * 归属 / 归属标的 互斥：后端是 AND，`mapped=no` 配任一具体标的恒为空集，
 * 不清理的话用户会看到「0 条」以为数据没了。选哪个就清掉另一个。
 */
function handleMappedChange(val: 'yes' | 'no' | null) {
  searchParams.mapped = val;
  if (val) searchParams.vm_symbol = null;
  handleSearch();
}

function handleVmSymbolChange(val: string | null) {
  searchParams.vm_symbol = val;
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
  // 行情同步会重算派生列，顺手刷一次覆盖计数（vm_symbol 不受影响，见 group_summary 注释）
  await executeSync(syncGroup, syncLoading, async () => {
    await Promise.all([fetchData(), fetchCoverage()]);
  });
}

// 金额渲染：保留两位小数，null 显示 '-'
function renderAmount(row: Api.Bills.GroupSymbol, key: keyof Api.Bills.GroupSymbol) {
  const val = row[key];
  return val != null ? Number(val).toFixed(2) : '-';
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

// 最新价：保留 4 位小数，null 显示 '-'
function renderPrice(row: Api.Bills.GroupSymbol) {
  const val = row.price;
  return val != null ? Number(val).toFixed(4) : '-';
}

// ---------------- 归属标的（唯一的人工列） ----------------
/**
 * 可归属判定 —— 与后端 `app/bills/constants.py::is_attachable` 同一口径。
 *
 * 资金流水行（RZRQ 融资融券 / CRJ 出入金 / SYFY 收益费用 / cash 现金）以及理财逆回购，
 * symbol 只是流水占位代码而非证券。给它们挂标的既不会产生「该标的的成交」，
 * 还会让「未归属」计数永远挂着选不完的行。所以这类行统一显示 `—` 且禁用下拉。
 *
 * ⚠️ 改动这里必须同步后端 constants.py，否则前端能选、后端 400，表现为「选了弹回」。
 */
const TRADE_CATS = ['证券交易', '期货交易', '期权交易'];
const VIRTUAL_SYMBOLS = ['RZRQ', 'SYFY', 'CRJ', 'cash'];

function isAttachable(row: Api.Bills.GroupSymbol) {
  return TRADE_CATS.includes(row.category) && !VIRTUAL_SYMBOLS.includes(row.symbol);
}

// 不可归属行的说明文案（按分类给具体原因，比统一一句「不参与归属」有用）
function nonAttachableHint(row: Api.Bills.GroupSymbol) {
  if (row.symbol === 'RZRQ') return '融资融券：融资行为本身，不归属任何标的';
  if (row.symbol === 'CRJ') return '出入金流水：资金进出，不归属任何标的';
  if (row.symbol === 'SYFY') return '收益费用流水：利息/手续费，不归属任何标的';
  if (row.symbol === 'cash') return '现金行：资金头寸，不归属任何标的';
  return `${row.category}：资金流水/理财，不是证券交易，不参与标的归属`;
}

const vmSaving = ref<number | null>(null);

/**
 * 写归属：**只写 vm_symbol 一列**（后端 update_columns 白名单），
 * 不会把上一屏的派生列旧值回写，所以这里也不必整行重取。
 *
 * NSelect 是受控组件，必须把返回值写回 row，否则选了会弹回原值。
 */
async function handleVmChange(row: Api.Bills.GroupSymbol, val: string | null) {
  if (!isAttachable(row)) return;
  if ((row.vm_symbol ?? null) === (val ?? null)) return;
  vmSaving.value = row.id;
  try {
    const { data, error } = await updateGroupSymbolVm(row.id, { vm_symbol: val || null });
    if (!error) {
      row.vm_symbol = data?.vm_symbol ?? null;
      const nm = row.vm_symbol ? vmNameMap.value[row.vm_symbol] || '' : '';
      window.$message?.success(row.vm_symbol ? `已归属 ${row.vm_symbol} ${nm}` : '已取消归属');
      // 覆盖计数随之变化；表格本身不需要整页刷新
      fetchCoverage();
    }
  } finally {
    vmSaving.value = null;
  }
}

// 归属列渲染：不可归属 ⇒ 「—」（附原因，不是漏配）；其余 ⇒ 可清空的 NSelect
function renderVmSymbol(row: Api.Bills.GroupSymbol) {
  if (!isAttachable(row)) {
    return h(NTooltip, null, {
      trigger: () => h('span', { class: 'text-gray-400', style: 'cursor: help' }, '—'),
      default: () => nonAttachableHint(row)
    });
  }
  return h(NSelect, {
    value: row.vm_symbol ?? null,
    options: vmOptions.value,
    clearable: true,
    filterable: true,
    size: 'small',
    placeholder: '未归属',
    loading: vmSaving.value === row.id,
    'onUpdate:value': (v: string | null) => handleVmChange(row, v)
  });
}

const columns = [
  { title: '交易分类', key: 'category', width: 80 },
  {
    // 代码只做展示与复制。v3 起笔记不在本页（标的层档案在 /irs/value-monitors，
    // 单笔成交笔记在 /bills/bills），所以这里不再挂弹窗入口。
    // 不折行：19 字符的最长合约代码（如 CFFEX.IO2611-P-4000）要能一行显示。
    // ⚠️ 用 span 而不是 NButton：naive-ui 按钮样式带 user-select:none，代码没法选中复制
    title: '代码',
    key: 'symbol',
    width: 200,
    render: (row: Api.Bills.GroupSymbol) =>
      h('span', { class: 'whitespace-nowrap', style: 'user-select: text' }, row.symbol)
  },
  {
    // 归属标的：合约 → 标的的唯一桥梁。选中后该合约的全部成交都归到这个标的名下
    title: '归属标的',
    key: 'vm_symbol',
    width: 200,
    render: (row: Api.Bills.GroupSymbol) => renderVmSymbol(row)
  },
  { title: '交易次数', key: 'count', width: 80, align: 'right' as const },
  {
    title: '持仓量',
    key: 'p_total',
    width: 100,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderAmount(row, 'p_total')
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
    title: '最新价',
    key: 'price',
    width: 100,
    align: 'right' as const,
    render: (row: Api.Bills.GroupSymbol) => renderPrice(row)
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
  searchParams.vm_symbol = null;
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
  loadVmOptions();
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
            v-model:value="searchParams.vm_symbol"
            :options="vmOptions"
            clearable
            filterable
            placeholder="全部"
            style="width: 200px"
            @update:value="handleVmSymbolChange"
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
  </div>
</template>
