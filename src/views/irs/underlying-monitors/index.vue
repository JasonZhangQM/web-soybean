<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { fetchUnderlyingMonitors, syncIrs } from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination } from '@/hooks/common/table';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { executeSync } from '@/utils/sync-feedback';
import { fmtMoney, fmtPrice, metricHeader } from '@/views/irs/risk-board/modules/utils';
import DetailDrawer from './modules/DetailDrawer.vue';
/** 新增/编辑抽屉：2026-11-16 从本页抽出共享，/risk 的档案抽屉也用同一份（不再跳页） */
import EditDrawer from './modules/EditDrawer.vue';

defineOptions({ name: 'IrsUnderlyingMonitorsPage' });

const route = useRoute();
const router = useRouter();

const loading = ref(false);
// 同步年度行情专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncYearLoading = ref(false);
// 同步实时行情专用 loading：与表格 loading 分离，避免同步过程中表格闪烁
const syncLoading = ref(false);
const tableData = ref<Api.Irs.UnderlyingMonitor[]>([]);
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
  const { data, error } = await fetchUnderlyingMonitors({ limit: 200 });
  if (!error && data) {
    themeList.value = Array.from(new Set(data.items.map(i => i.theme).filter((t): t is string => !!t))).sort();
  }
}

const researchStateOptions = [
  { label: '还没做研究', value: 'none' },
  { label: '复核已到期', value: 'due' }
];

// 拉取标的监测列表
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchUnderlyingMonitors({
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
  await executeSync(() => syncIrs('underlying-monitor-hlc'), syncYearLoading, fetchData);
}

// 触发同步实时行情（gm current 获取最新价，触发钩子计算 pv_* 指标）
async function handleSync() {
  await executeSync(() => syncIrs('underlying-monitor'), syncLoading, fetchData);
}

// ===== 档案抽屉 =====
const showDrawer = ref(false);
const drawerRow = ref<Api.Irs.UnderlyingMonitor | null>(null);
/** 编辑保存后调 refresh() 静默重拉档案，标题/主题标签立即跟上，不用关掉重开 */
const detailDrawerRef = ref<InstanceType<typeof DetailDrawer> | null>(null);

function openDrawer(row: Api.Irs.UnderlyingMonitor) {
  drawerRow.value = row;
  showDrawer.value = true;
}

/** 抽屉里改完：刷列表（结论/复核/计划计数都在列表上） */
function onDetailChanged() {
  fetchData();
}

/**
 * 外部跳转进入：`?um=SYMBOL` 自动开抽屉
 *
 * 账单页/合约页的「归属标的」链接都走这个入口，省掉"先搜再点"。
 */
async function openFromQuery() {
  const sym = route.query.um;
  if (typeof sym !== 'string' || !sym) return;
  // 消费即摘除：否则 um 参数留在标签 fullPath 里，每次切回本页组件重挂载
  // 都会重新触发 onMounted → openFromQuery，抽屉跟着再弹一次。
  // replace 不产生历史记录；um: undefined 在 vue-router 里即删除该键。
  router.replace({ query: { ...route.query, um: undefined } });
  const { data, error } = await fetchUnderlyingMonitors({ symbol: sym, limit: 1 });
  if (!error && data?.items?.length) {
    openDrawer(data.items[0]);
  } else if (!error) {
    window.$message?.warning(`标的 ${sym} 不在标的监测里`);
  }
}

// ===== 新增/编辑抽屉（2026-11-16 抽到 modules/EditDrawer.vue，/risk 共用同一份） =====
const showEdit = ref(false);
/** null = 新增模式；非 null = 编辑模式（回填这一行） */
const editRow = ref<Api.Irs.UnderlyingMonitor | null>(null);

function handleAdd() {
  editRow.value = null;
  showEdit.value = true;
}

/** 档案抽屉头部「编辑标的信息」/ 列表操作列 → 原地打开编辑抽屉 */
function handleEdit(row: Api.Irs.UnderlyingMonitor) {
  editRow.value = row;
  showEdit.value = true;
}

/**
 * 编辑 / 新增 / 删除成功：刷新列表与主题候选（列表分页回第一页）。
 * 删除后若档案抽屉正开着这行，一并关掉，避免留一个指向已删标的的抽屉；
 * 保存后调档案抽屉的 refresh() 静默重拉，标题 / 主题标签立即跟上，不用关掉重开。
 */
function onEditChanged({ deleted, symbol }: { deleted: boolean; symbol: string }) {
  if (deleted && drawerRow.value?.symbol === symbol) showDrawer.value = false;
  pagination.page = 1;
  fetchData();
  loadThemeOptions();
  if (!deleted) detailDrawerRef.value?.refresh();
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
const fmtQuote = (row: Api.Irs.UnderlyingMonitor, v: number | null) => {
  if (v == null) return '-';
  return Number(v).toFixed(row.name?.includes('ETF') ? 3 : 2);
};
// 估值价合并列：主值后追加(百分比%,y百分比%)，如 3500(-24.44%,-24.41%)
// 价格去尾零统一复用共用 fmtPrice（与风险看板、到档情景同口径），勿在此另写一份格式化
const fmtPriceMerged = (price: number | null, pct: number | null, pctY: number | null) => {
  const p = fmtPrice(price);
  if (pct == null && pctY == null) return p;
  const pPct = pct != null ? `${Number(pct).toFixed(2)}%` : '-';
  const pPctY = pctY != null ? `${Number(pctY).toFixed(2)}%` : '-';
  return `${p}(${pPct},${pPctY})`;
};
// 行情合并列：主值按ETF规则保留小数，后追加(y值%)，如 5064.27(9.38%)
const fmtQuoteMerged = (row: Api.Irs.UnderlyingMonitor, main: number | null, y: number | null) => {
  const m = main != null ? Number(main).toFixed(row.name?.includes('ETF') ? 3 : 2) : '-';
  return y != null ? `${m}(${Number(y).toFixed(2)}%)` : m;
};

// 今天：用于「复核到期」标红
const TODAY = today();

/**
 * 列表「风险敞口」列头「?」：口径说明与排序来源。
 * 与抽屉档位 Tab 的 metricHeader 同一套组件样式，不另写一份。
 */
const EXPOSURE_NOTES = [
  '标的项下持仓风险敞口合计：bills_group_symbol 按归属标的（显式 underlying_symbol 优先、否则代码本身）汇总 SUM(risk_exposure)，只计可归属的交易行。',
  '人工确认的静态值，不随行情、档位或时点变化；空 = 未设置，显示「-」，不伪造 0。与标的推演「标的敞口合计」、抽屉「该标的项下合计」同源。',
  '含全部账户该标的项下持仓；与档位 Tab 五档表「标的风险敞口」逐值一致，与分账户表「风险敞口」（账户全部持仓口径）不是一回事，不可相加对账。',
  '列表由后端按该值倒序（NULL 最后、代码升序兜底），排序发生在分页前；列头不可点击切换。'
];

const columns = [
  {
    // 名称是档案入口：点了开抽屉（编辑标的信息在抽屉头部与右侧「操作」列）
    title: '名称',
    key: 'name',
    width: 100,
    render: (row: Api.Irs.UnderlyingMonitor) =>
      h(
        NButton,
        { text: true, type: 'primary', onClick: () => openDrawer(row) },
        { default: () => row.name || row.symbol }
      )
  },
  {
    // 标的项下持仓敞口合计：后端算、后端倒序，前端只展示（金额格式与档位 Tab 同源）
    title: metricHeader('风险敞口', EXPOSURE_NOTES),
    key: 'risk_exposure',
    width: 120,
    align: 'right' as const,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtMoney(row.risk_exposure)
  },
  {
    // 主题只在标的层维护：合约层的 theme 列 v3 已删除
    title: '主题',
    key: 'theme',
    width: 80,
    ellipsis: { tooltip: true },
    render: (row: Api.Irs.UnderlyingMonitor) => row.theme || '-'
  },
  {
    // 结论取自最新一版研究（≤今天），不是主表的列
    title: '结论',
    key: 'research_conclusion',
    width: 60,
    ellipsis: { tooltip: true },
    render: (row: Api.Irs.UnderlyingMonitor) =>
      row.research_conclusion ? row.research_conclusion : h('span', { class: 'text-gray-300' }, '未填')
  },
  {
    // 档位带（P0-1）：现价所在区间带语义；口径唯一在后端，这里只显示
    title: '档位带',
    key: 'zone',
    width: 110,
    render: (row: Api.Irs.UnderlyingMonitor) =>
      row.zone
        ? h(NTag, { size: 'tiny', bordered: false, type: 'info' }, { default: () => row.zone })
        : h('span', { class: 'text-gray-300' }, '—')
  },
  {
    // PE 分位（P2-1，来源 bds 指数估值，标 10y）：只对 000300/000905/SPX 有效，其余 —
    title: 'PE分位(10y)',
    key: 'pe_pct',
    width: 100,
    render: (row: Api.Irs.UnderlyingMonitor) => {
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
    render: (row: Api.Irs.UnderlyingMonitor) => {
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
    render: (row: Api.Irs.UnderlyingMonitor) => {
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
    render: (row: Api.Irs.UnderlyingMonitor) => {
      if (!row.next_review) return h('span', { class: 'text-gray-300' }, '未填');
      const overdue = row.next_review < TODAY;
      return h('span', { class: overdue ? 'text-red-500' : '' }, row.next_review);
    }
  },
  // 行情字段（合并 % 列：主值后追加 %）
  {
    title: '上年末',
    key: 'py_close',
    width: 100,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtQuote(row, row.py_close)
  },
  {
    title: '最新价',
    key: 'price',
    width: 150,
    render: (row: Api.Irs.UnderlyingMonitor) =>
      h('span', { style: 'font-weight: bold' }, fmtQuoteMerged(row, row.price, row.pv_yy))
  },
  {
    title: '年高',
    key: 'y_high',
    width: 140,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtQuoteMerged(row, row.y_high, row.pv_yh)
  },
  {
    title: '年低',
    key: 'y_low',
    width: 140,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtQuoteMerged(row, row.y_low, row.pv_yl)
  },
  // 估值区间（合并 % 和 y% 列）
  {
    title: '极低',
    key: 'pp_el',
    width: 190,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtPriceMerged(row.pp_el, row.pv_el, row.pv_el_y)
  },
  {
    title: '低',
    key: 'pp_l',
    width: 190,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtPriceMerged(row.pp_l, row.pv_l, row.pv_l_y)
  },
  {
    title: '中',
    key: 'pp_m',
    width: 190,
    render: (row: Api.Irs.UnderlyingMonitor) =>
      h('span', { style: 'font-weight: bold' }, fmtPriceMerged(row.pp_m, row.pv_m, row.pv_m_y))
  },
  {
    title: '高',
    key: 'pp_h',
    width: 190,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtPriceMerged(row.pp_h, row.pv_h, row.pv_h_y)
  },
  {
    title: '极高',
    key: 'pp_eh',
    width: 190,
    render: (row: Api.Irs.UnderlyingMonitor) => fmtPriceMerged(row.pp_eh, row.pv_eh, row.pv_eh_y)
  }
];

/**
 * 横向滚动宽度 = 各列 width 之和（铁律 4.11：**列宽一改必须重算**，否则
 * scroll-x 偏小会让浏览器压缩列、内容被迫折行——正是「换行」的根源）。
 * 实际值由下面的 reduce 自动求和；算式仅作核对（2026-11-12 名称后新增「风险敞口」120）：
 * 100+120+80+60+110+100+100+100+115+100+150+140+140+190×5 = 2365。
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

    <!-- 标的档案抽屉：概览 / 研究与复盘 / 档位 / 剧本与成交 -->
    <DetailDrawer
      ref="detailDrawerRef"
      v-model:show="showDrawer"
      :row="drawerRow"
      @edit="handleEdit"
      @changed="onDetailChanged"
    />

    <!-- 新增 / 编辑：与 /risk 共用 modules/EditDrawer.vue，编辑表单不再长在本页 -->
    <EditDrawer v-model:show="showEdit" :row="editRow" :theme-options="themeOptions" @changed="onEditChanged" />
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
