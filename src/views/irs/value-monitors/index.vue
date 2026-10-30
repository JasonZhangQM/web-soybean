<script setup lang="ts">
import { ref, reactive, computed, h, watch, onMounted } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { useRoute } from 'vue-router';
import { fetchValueMonitors, createValueMonitor, updateValueMonitor, deleteValueMonitor, syncIrs } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination } from '@/hooks/common/table';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { executeSync } from '@/utils/sync-feedback';
import DetailDrawer from './modules/DetailDrawer.vue';

defineOptions({ name: 'IrsValueMonitorsPage' });

const route = useRoute();

const loading = ref(false);
// 同步年度行情专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncYearLoading = ref(false);
// 同步实时行情专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Irs.ValueMonitor[]>([]);
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();

/**
 * 筛选：代码（精确）+ 主题（多选）+ 研究状态
 *
 * 主题只在本页维护（合约层已无 theme 列），所以主题筛选也只在这里出现。
 * 多值走 repeat 直通后端（铁律 4.5），不在前端过滤——否则计数与分页都会骗人。
 */
const searchParams = reactive<{
  symbol: string | null;
  theme: string[] | null;
  research_state: 'none' | 'due' | null;
}>({
  symbol: null,
  theme: null,
  research_state: null
});
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 列表搜索区代码远程搜索：与新增模态框隔离，独立维护 options
const {
  symbolOptions: searchSymbolOptions,
  symbolLoading: searchSymbolLoading,
  handleSymbolSearch: handleSearchSymbolSearch,
  clearSymbolOptions: clearSearchSymbolOptions
} = useSymbolSearch();

// 主题候选：单独取一次全量（不受当前筛选影响），否则一按主题筛，选项就塌缩成只剩当前那个
const themeList = ref<string[]>([]);
const themeOptions = computed(() => themeList.value.map(t => ({ label: t, value: t })));

async function loadThemeOptions() {
  const { data, error } = await fetchValueMonitors({ limit: 200 });
  if (!error && data) {
    themeList.value = Array.from(new Set(data.items.map(i => i.theme).filter((t): t is string => !!t))).sort();
  }
}

const researchStateOptions = [
  { label: '还没做研究', value: 'none' },
  { label: '复核已到期', value: 'due' }
];

// 拉取估值监测列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchValueMonitors({
      symbol: searchParams.symbol || undefined,
      theme: searchParams.theme?.length ? searchParams.theme : undefined,
      research_state: searchParams.research_state || undefined,
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
  searchParams.symbol = null;
  searchParams.theme = null;
  searchParams.research_state = null;
  clearSearchSymbolOptions();
  pagination.page = 1;
  fetchData();
}

// 触发同步年度行情（gm history 拉取上年末至今数据，更新 py_close/y_high/y_low）
async function handleSyncYear() {
  await executeSync(() => syncIrs('value-monitor-hlc'), syncYearLoading, fetchData);
}

// 触发同步实时行情（gm current 获取最新价，触发钩子计算 pv_* 指标）
async function handleSync() {
  await executeSync(() => syncIrs('value-monitor'), syncLoading, fetchData);
}

// ===== 档案抽屉 =====
const showDrawer = ref(false);
const drawerRow = ref<Api.Irs.ValueMonitor | null>(null);

function openDrawer(row: Api.Irs.ValueMonitor) {
  drawerRow.value = row;
  showDrawer.value = true;
}

/** 抽屉里改完：刷列表（结论/复核/计划计数都在列表上） */
function onDetailChanged() {
  fetchData();
}

/**
 * 外部跳转进入：`?vm=SYMBOL` 自动开抽屉
 *
 * 账单页/合约页的「归属标的」链接都走这个入口，省掉"先搜再点"。
 */
async function openFromQuery() {
  const sym = route.query.vm;
  if (typeof sym !== 'string' || !sym) return;
  const { data, error } = await fetchValueMonitors({ symbol: sym, limit: 1 });
  if (!error && data?.items?.length) {
    openDrawer(data.items[0]);
  } else if (!error) {
    window.$message?.warning(`标的 ${sym} 不在估值监测里`);
  }
}

// ===== 新增/编辑模态框 =====
const editingId = ref<number | null>(null);
/** 编辑前的原始行：用于判断五档到底有没有改（没改就不该新建版本） */
const originalRow = ref<Api.Irs.ValueMonitor | null>(null);
const showModal = ref(false);
const submitLoading = ref(false);
const formRef = ref();
const formData = reactive({
  symbol: '',
  name: '',
  theme: '' as string | null,
  /** 档位版本生效日：选新日期=新建一版，选已有日期=改那一版 */
  effective_date: null as string | null,
  pp_el: null as number | null,
  pp_l: null as number | null,
  pp_m: null as number | null,
  pp_h: null as number | null,
  pp_eh: null as number | null,
  // 行情字段（兜底编辑，默认折叠）
  py_close: null as number | null,
  y_high: null as number | null,
  y_low: null as number | null,
  price: null as number | null
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 五档是否真的改了：只改名/主题时必须为 false，否则会凭空多出一版档位 */
const tiersChanged = computed(() => {
  if (editingId.value === null) return true;
  const o = originalRow.value;
  if (!o) return true;
  const keys = ['pp_el', 'pp_l', 'pp_m', 'pp_h', 'pp_eh'] as const;
  return keys.some(k => {
    const a = formData[k] == null ? null : Number(formData[k]);
    const b = o[k] == null ? null : Number(o[k]);
    return a !== b;
  });
});

// 行情折叠面板展开状态：默认折叠，仅编辑模式显示
const quoteExpandedNames = ref<string[]>([]);

// 代码远程搜索：NSelect remote，防抖 300ms 调 /bds/symbol-infos
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions, getNameBySymbol } = useSymbolSearch();

// 选择代码后自动回填名称（仅新增模式触发；编辑模式 symbol 禁用不会变）
function handleSymbolChange(symbol: string | null) {
  formData.symbol = symbol ?? '';
  if (symbol && editingId.value === null) {
    const name = getNameBySymbol(symbol);
    if (name) formData.name = name;
  }
}

// 模态框标题：新增/编辑动态切换
const modalTitle = computed(() => (editingId.value === null ? '新增估值监测' : '编辑估值监测'));

// "中"自动取"低"与"高"的平均值（低/高任一为空时置空），新增与编辑一致
watch(
  () => [formData.pp_l, formData.pp_h],
  ([low, high]) => {
    formData.pp_m = low != null && high != null ? Number(((Number(low) + Number(high)) / 2).toFixed(4)) : null;
  }
);

// 表单校验规则
const formRules = {
  symbol: { required: true, message: '请选择代码', trigger: 'change' },
  name: { required: true, message: '请输入名称', trigger: 'blur' },
  pp_el: { required: true, type: 'number' as const, message: '请输入极低', trigger: 'blur' },
  pp_l: { required: true, type: 'number' as const, message: '请输入低', trigger: 'blur' },
  pp_m: { required: true, type: 'number' as const, message: '请输入中', trigger: 'blur' },
  pp_h: { required: true, type: 'number' as const, message: '请输入高', trigger: 'blur' },
  pp_eh: { required: true, type: 'number' as const, message: '请输入极高', trigger: 'blur' }
};

// 打开新增模态框
function handleAdd() {
  resetForm();
  editingId.value = null;
  formData.effective_date = today();
  showModal.value = true;
}

// 打开编辑模态框：回填行数据
// 注意：后端 Decimal 字段经 JSON 序列化可能为字符串，需 Number() 转换为数字
function handleEdit(row: Api.Irs.ValueMonitor) {
  resetForm();
  editingId.value = row.id;
  originalRow.value = row;
  formData.symbol = row.symbol;
  formData.name = row.name ?? '';
  formData.theme = row.theme ?? null;
  // 默认取「当前生效版」的日期：改五档时若不改日期，就是覆盖当前生效那一版
  formData.effective_date = row.pp_effective_date ?? today();
  // 编辑回填时 NSelect 需有对应 option 才能显示，手动塞入当前行
  symbolOptions.value = [{ label: `${row.symbol} ${row.name ?? ''}`, value: row.symbol }];
  formData.pp_el = row.pp_el != null ? Number(row.pp_el) : null;
  formData.pp_l = row.pp_l != null ? Number(row.pp_l) : null;
  formData.pp_m = row.pp_m != null ? Number(row.pp_m) : null;
  formData.pp_h = row.pp_h != null ? Number(row.pp_h) : null;
  formData.pp_eh = row.pp_eh != null ? Number(row.pp_eh) : null;
  // 回填行情字段（兜底编辑用）
  formData.py_close = row.py_close != null ? Number(row.py_close) : null;
  formData.y_high = row.y_high != null ? Number(row.y_high) : null;
  formData.y_low = row.y_low != null ? Number(row.y_low) : null;
  formData.price = row.price != null ? Number(row.price) : null;
  showModal.value = true;
}

// 重置表单
function resetForm() {
  editingId.value = null;
  originalRow.value = null;
  formData.symbol = '';
  formData.name = '';
  formData.theme = null;
  formData.effective_date = null;
  formData.pp_el = null;
  formData.pp_l = null;
  formData.pp_m = null;
  formData.pp_h = null;
  formData.pp_eh = null;
  formData.py_close = null;
  formData.y_high = null;
  formData.y_low = null;
  formData.price = null;
  quoteExpandedNames.value = [];
  clearSymbolOptions();
  formRef.value?.restoreValidation();
}

// 提交新增/修改
async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  submitLoading.value = true;
  try {
    const tiers = {
      pp_el: formData.pp_el!,
      pp_l: formData.pp_l!,
      pp_m: formData.pp_m!,
      pp_h: formData.pp_h!,
      pp_eh: formData.pp_eh!
    };
    let error;
    if (editingId.value === null) {
      // 新增：需带 symbol；后端会顺手建首版档位
      ({ error } = await createValueMonitor({
        symbol: formData.symbol,
        name: formData.name,
        theme: formData.theme || null,
        effective_date: formData.effective_date || null,
        ...tiers
      }));
    } else {
      // 修改：
      // - 五档没改 -> pp_* 一个都不传，后端跳过版本写入（否则每次改名都会凭空多一版）
      // - 行情字段仅展开编辑时才传，未展开不传（后端 None 表示不修改）
      const quoteExpanded = quoteExpandedNames.value.includes('quote');
      ({ error } = await updateValueMonitor(editingId.value, {
        name: formData.name,
        theme: formData.theme || null,
        ...(tiersChanged.value ? { ...tiers, effective_date: formData.effective_date || null } : {}),
        ...(quoteExpanded
          ? {
              py_close: formData.py_close,
              y_high: formData.y_high,
              y_low: formData.y_low,
              price: formData.price
            }
          : {})
      }));
    }
    if (!error) {
      window.$message?.success(editingId.value === null ? '新增成功' : '修改成功');
      showModal.value = false;
      const wasEdit = editingId.value !== null;
      resetForm();
      if (!wasEdit) pagination.page = 1;
      fetchData();
      loadThemeOptions();
    }
  } finally {
    submitLoading.value = false;
  }
}

// 取消新增/编辑
function handleCancel() {
  showModal.value = false;
  resetForm();
}

/**
 * 删除：先调 DELETE 不带 cascade — 有子数据后端返回 409 + 各子表计数，
 * 前端把代价摆在确认框里；确认后带 cascade=true 再删。
 * 不再走 detail 接口取计数（detail 已瘦身，不再返回各子表数组）。
 */
async function handleDelete() {
  if (editingId.value === null) return;
  const id = editingId.value;
  submitLoading.value = true;
  try {
    // 第一次尝试：不 cascade
    const { data, error } = await deleteValueMonitor(id, false);
    if (!error && data) {
      // 没有子数据，直接删成功
      window.$message?.success('删除成功');
      showModal.value = false;
      resetForm();
      pagination.page = 1;
      fetchData();
      loadThemeOptions();
      return;
    }
    // 后端返回 409：解析 counts 构建确认框
    const detailObj = (error as any)?.response?.data?.detail;
    const counts: Record<string, number> = detailObj?.counts ?? {};
    const hasChild = Object.values(counts).some(n => n > 0);
    if (!hasChild) return; // 不应该走到这里，但兜底

    const labelMap: Record<string, string> = {
      version: '档位版本',
      research: '研究版本',
      logic: '投资逻辑',
      invalidate: '证伪条件',
      plan: '剧本'
    };
    const detailText = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${labelMap[k] ?? k} ${n} 条`)
      .join('、');

    window.$dialog?.warning({
      title: `标的还有档案：${detailText}`,
      content: '删除会连同上面这些档案一起清空（成交笔记不会删——它挂的是成交，不是标的）。这一步不可恢复，确认继续？',
      positiveText: '确认删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        const res = await deleteValueMonitor(id, true);
        if (!res.error) {
          window.$message?.success('删除成功');
          showModal.value = false;
          resetForm();
          pagination.page = 1;
          fetchData();
          loadThemeOptions();
        }
      }
    });
  } finally {
    submitLoading.value = false;
  }
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

// 行情字段：名称含 ETF 保留 3 位小数，否则保留 2 位小数，空值显示 '-'
const fmtQuote = (row: Api.Irs.ValueMonitor, v: number | null) => {
  if (v == null) return '-';
  return Number(v).toFixed(row.name?.includes('ETF') ? 3 : 2);
};
// 估值价合并列：主值后追加(百分比%,y百分比%)，如 3500(-24.44%,-24.41%)
const fmtPriceMerged = (price: number | null, pct: number | null, pctY: number | null) => {
  const p =
    price != null
      ? Number(price)
          .toFixed(4)
          .replace(/\.?0+$/, '')
      : '-';
  if (pct == null && pctY == null) return p;
  const pPct = pct != null ? `${Number(pct).toFixed(2)}%` : '-';
  const pPctY = pctY != null ? `${Number(pctY).toFixed(2)}%` : '-';
  return `${p}(${pPct},${pPctY})`;
};
// 行情合并列：主值按ETF规则保留小数，后追加(y值%)，如 5064.27(9.38%)
const fmtQuoteMerged = (row: Api.Irs.ValueMonitor, main: number | null, y: number | null) => {
  const m = main != null ? Number(main).toFixed(row.name?.includes('ETF') ? 3 : 2) : '-';
  return y != null ? `${m}(${Number(y).toFixed(2)}%)` : m;
};

// 今天：用于「复核到期」标红
const TODAY = today();

const columns = [
  {
    // 名称是档案入口：点了开抽屉（编辑标的信息在抽屉头部与右侧「操作」列）
    title: '名称',
    key: 'name',
    width: 100,
    render: (row: Api.Irs.ValueMonitor) =>
      h(
        NButton,
        { text: true, type: 'primary', onClick: () => openDrawer(row) },
        { default: () => row.name || row.symbol }
      )
  },
  {
    // 主题只在标的层维护：合约层的 theme 列 v3 已删除
    title: '主题',
    key: 'theme',
    width: 60,
    ellipsis: { tooltip: true },
    render: (row: Api.Irs.ValueMonitor) => row.theme || '-'
  },
  {
    // 结论取自最新一版研究（≤今天），不是主表的列
    title: '结论',
    key: 'research_conclusion',
    width: 60,
    ellipsis: { tooltip: true },
    render: (row: Api.Irs.ValueMonitor) =>
      row.research_conclusion ? row.research_conclusion : h('span', { class: 'text-gray-300' }, '未填')
  },
  {
    // 档位带（P0-1）：现价所在区间带语义；口径唯一在后端，这里只显示
    title: '档位带',
    key: 'zone',
    width: 110,
    render: (row: Api.Irs.ValueMonitor) =>
      row.zone
        ? h(NTag, { size: 'tiny', bordered: false, type: 'info' }, { default: () => row.zone })
        : h('span', { class: 'text-gray-300' }, '—')
  },
  {
    // PE 分位（P2-1，来源 bds 指数估值，标 10y）：只对 000300/000905/SPX 有效，其余 —
    title: 'PE分位(10y)',
    key: 'pe_pct',
    width: 100,
    render: (row: Api.Irs.ValueMonitor) => {
      const pe = row.pe_pct;
      return pe != null
        ? h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, { default: () => `${Number(pe).toFixed(1)}%` })
        : h('span', { class: 'text-gray-300' }, '—');
    }
  },
  {
    // PB 分位（P2-1）：与 PE 分位同源，用不同底色与手填档位区隔
    title: 'PB分位(10y)',
    key: 'pb_pct',
    width: 100,
    render: (row: Api.Irs.ValueMonitor) => {
      const pb = row.pb_pct;
      return pb != null
        ? h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, { default: () => `${Number(pb).toFixed(1)}%` })
        : h('span', { class: 'text-gray-300' }, '—');
    }
  },
  {
    // 剧本：生效剧本数。> 0 用橙色，提示"这里有等你动手的事"
    title: '剧本',
    key: 'plan',
    width: 100,
    render: (row: Api.Irs.ValueMonitor) => {
      const active = row.plan_active ?? 0;
      if (!active) return h('span', { class: 'text-gray-300' }, '-');
      return h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, { default: () => `剧本 ${active}` });
    }
  },
  {
    // 复核：到期标红。这是档案"该更新了"的唯一提醒
    title: '复核',
    key: 'next_review',
    width: 115,
    render: (row: Api.Irs.ValueMonitor) => {
      if (!row.next_review) return h('span', { class: 'text-gray-300' }, '未填');
      const overdue = row.next_review < TODAY;
      return h('span', { class: overdue ? 'text-red-500' : '' }, row.next_review);
    }
  },
  // 行情字段（合并 % 列：主值后追加 %）
  { title: '上年末', key: 'py_close', width: 100, render: (row: Api.Irs.ValueMonitor) => fmtQuote(row, row.py_close) },
  {
    title: '最新价',
    key: 'price',
    width: 150,
    render: (row: Api.Irs.ValueMonitor) =>
      h('span', { style: 'font-weight: bold' }, fmtQuoteMerged(row, row.price, row.pv_yy))
  },
  {
    title: '年高',
    key: 'y_high',
    width: 140,
    render: (row: Api.Irs.ValueMonitor) => fmtQuoteMerged(row, row.y_high, row.pv_yh)
  },
  {
    title: '年低',
    key: 'y_low',
    width: 140,
    render: (row: Api.Irs.ValueMonitor) => fmtQuoteMerged(row, row.y_low, row.pv_yl)
  },
  // 估值区间（合并 % 和 y% 列）
  {
    title: '极低',
    key: 'pp_el',
    width: 190,
    render: (row: Api.Irs.ValueMonitor) => fmtPriceMerged(row.pp_el, row.pv_el, row.pv_el_y)
  },
  {
    title: '低',
    key: 'pp_l',
    width: 190,
    render: (row: Api.Irs.ValueMonitor) => fmtPriceMerged(row.pp_l, row.pv_l, row.pv_l_y)
  },
  {
    title: '中',
    key: 'pp_m',
    width: 190,
    render: (row: Api.Irs.ValueMonitor) =>
      h('span', { style: 'font-weight: bold' }, fmtPriceMerged(row.pp_m, row.pv_m, row.pv_m_y))
  },
  {
    title: '高',
    key: 'pp_h',
    width: 190,
    render: (row: Api.Irs.ValueMonitor) => fmtPriceMerged(row.pp_h, row.pv_h, row.pv_h_y)
  },
  {
    title: '极高',
    key: 'pp_eh',
    width: 190,
    render: (row: Api.Irs.ValueMonitor) => fmtPriceMerged(row.pp_eh, row.pv_eh, row.pv_eh_y)
  }
];

/**
 * 横向滚动宽度 = 各列 width 之和（铁律 4.11：**列宽一改必须重算**，否则
 * scroll-x 偏小会让浏览器压缩列、内容被迫折行——正是「换行」的根源）。
 * 当前 130+100+220+110+100+100+100+115+100+150+140+140+190×5 = 2455。
 * 总宽超出容器时由 NDataTable 内部横向滚动接管，页面本身不出现横向滚动条。
 */
const scrollX = columns.reduce((sum, col) => sum + ((col.width as number) ?? 0), 0);

onMounted(async () => {
  fetchData();
  loadThemeOptions();
  await openFromQuery();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="代码">
          <NSelect
            v-model:value="searchParams.symbol"
            :options="searchSymbolOptions"
            :loading="searchSymbolLoading"
            filterable
            remote
            clearable
            placeholder="代码搜索"
            style="width: 240px"
            @search="handleSearchSymbolSearch"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="主题">
          <NSelect
            v-model:value="searchParams.theme"
            :options="themeOptions"
            multiple
            clearable
            filterable
            placeholder="全部"
            style="width: 220px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="研究">
          <NSelect
            v-model:value="searchParams.research_state"
            :options="researchStateOptions"
            clearable
            placeholder="全部"
            style="width: 140px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NSpace>
            <NButton :loading="syncYearLoading" @click="handleSyncYear">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              年度
            </NButton>
            <NButton :loading="syncLoading" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              行情
            </NButton>
            <NButton @click="handleAdd">
              <template #icon><SvgIcon icon="mdi:plus" /></template>
              新增
            </NButton>
          </NSpace>
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
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 标的档案抽屉：概览 / 研究 / 档位 / 逻辑与证伪 / 计划与成交 -->
    <DetailDrawer v-model:show="showDrawer" :row="drawerRow" @edit="handleEdit" @changed="onDetailChanged" />

    <NDrawer v-model:show="showModal" placement="left" width="480" :mask-closable="false" :close-on-esc="false">
      <NDrawerContent :title="modalTitle" closable :native-scrollbar="false">
        <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="90px">
          <NFormItem label="代码" path="symbol">
            <NSelect
              :value="formData.symbol || null"
              :options="symbolOptions"
              :loading="symbolLoading"
              :disabled="editingId !== null"
              filterable
              remote
              clearable
              placeholder="输入代码或名称搜索"
              style="width: 100%"
              @search="handleSymbolSearch"
              @update:value="handleSymbolChange"
            />
          </NFormItem>
          <NFormItem label="名称" path="name">
            <NInput v-model:value="formData.name" placeholder="请输入名称" />
          </NFormItem>
          <NFormItem label="主题">
            <NSelect
              v-model:value="formData.theme"
              :options="themeOptions"
              filterable
              tag
              clearable
              placeholder="黄金 / IC贴水 / 红利…（可输入新标签，跨合约聚合用）"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="极低" path="pp_el">
            <NInputNumber
              v-model:value="formData.pp_el"
              :precision="4"
              :step="0.0001"
              placeholder="请输入极低"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="低" path="pp_l">
            <NInputNumber
              v-model:value="formData.pp_l"
              :precision="4"
              :step="0.0001"
              placeholder="请输入低"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="中" path="pp_m">
            <NInputNumber
              v-model:value="formData.pp_m"
              :precision="4"
              :step="0.0001"
              :disabled="true"
              placeholder="自动取低与高的平均"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="高" path="pp_h">
            <NInputNumber
              v-model:value="formData.pp_h"
              :precision="4"
              :step="0.0001"
              placeholder="请输入高"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="极高" path="pp_eh">
            <NInputNumber
              v-model:value="formData.pp_eh"
              :precision="4"
              :step="0.0001"
              placeholder="请输入极高"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="档位生效日">
            <NDatePicker
              v-model:formatted-value="formData.effective_date"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              :disabled="editingId !== null && !tiersChanged"
              style="width: 100%"
            />
          </NFormItem>
          <div
            class="mb-8px text-12px"
            :class="editingId !== null && !tiersChanged ? 'text-gray-400' : 'text-orange-500'"
          >
            {{
              editingId === null
                ? '新增标的时按此日期建立首版档位'
                : tiersChanged
                  ? '五档已改：选新日期 = 新建一版，选已有日期 = 改那一版'
                  : '五档未改：只改名称/主题，不会新建档位版本'
            }}
          </div>
          <!-- 行情字段：仅编辑模式显示，默认折叠，展开后可兜底编辑 -->
          <NCollapse v-if="editingId !== null" v-model:expanded-names="quoteExpandedNames" class="mt-8px">
            <NCollapseItem title="行情字段（兜底编辑）" name="quote">
              <NFormItem label="上年末" path="py_close">
                <NInputNumber
                  v-model:value="formData.py_close"
                  :precision="4"
                  :step="0.0001"
                  placeholder="上年末收盘价"
                  class="w-full"
                />
              </NFormItem>
              <NFormItem label="年高" path="y_high">
                <NInputNumber
                  v-model:value="formData.y_high"
                  :precision="4"
                  :step="0.0001"
                  placeholder="年度最高价"
                  class="w-full"
                />
              </NFormItem>
              <NFormItem label="年低" path="y_low">
                <NInputNumber
                  v-model:value="formData.y_low"
                  :precision="4"
                  :step="0.0001"
                  placeholder="年度最低价"
                  class="w-full"
                />
              </NFormItem>
              <NFormItem label="最新价" path="price">
                <NInputNumber
                  v-model:value="formData.price"
                  :precision="4"
                  :step="0.0001"
                  placeholder="最新成交价"
                  class="w-full"
                />
              </NFormItem>
            </NCollapseItem>
          </NCollapse>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="handleCancel">取消</NButton>
            <NButton ghost :loading="submitLoading" @click="handleSubmit">
              {{ editingId === null ? '确定' : '修改' }}
            </NButton>
            <NButton v-if="editingId !== null" type="error" ghost :loading="submitLoading" @click="handleDelete">
              删除
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/*
 * 单元格一律不折行：内容超出列宽时由表格横向滚动接管（scroll-x = 列宽之和）。
 *
 * 为什么必须用 :deep()：NDataTable 的 th/td 是子组件渲染的，scoped 属性加不到它们身上，
 * 直接写 .n-data-table-td 无效且不报错，表现为「改了没反应」。
 *
 * 为什么不用 ellipsis 一刀切：「研究结论」最长 800 字，真不折行就得给 800 字的列宽；
 * 所以只有它和「主题」配 ellipsis(tooltip) 做截断，其余列靠放宽 width 完整显示。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
