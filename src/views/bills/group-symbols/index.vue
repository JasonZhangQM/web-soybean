<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { fetchGroupSymbols, syncGroup, updateGroupSymbolNote } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { trimSearchParams } from '@/utils/common';
import { useBillsStore } from '@/store/modules/bills';
import { usePageState } from '@/hooks/common/page-state';
import { useSymbolSearch } from '@/hooks/common/symbol-search';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'BillsGroupSymbolsPage' });

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

// 筛选参数：category 单选精确匹配，symbol NAutoComplete 支持直接输入提交，
// pos_state 下拉二选（holding 持仓中 / closed 已平仓），留空 = 全部（不传该参数），默认 holding；
// has_note 只看写过笔记的
const searchParams = reactive<{
  category?: string | null;
  symbol?: string;
  pos_state: 'holding' | 'closed' | null;
  has_note: boolean;
}>({
  pos_state: 'holding',
  has_note: false
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

// 后端 pos_state 带 pattern 校验（仅 holding|closed）：null = 全部（不传），
// 顺带兜住 usePageState 可能恢复的旧三态残值 'all'
function toPosStateParam(val: string | null) {
  return val === 'holding' || val === 'closed' ? val : undefined;
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
      // 仅勾选时传递
      has_note: searchParams.has_note === true ? true : undefined,
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
 * - 类别 / 持仓 / 笔记：值一变就搜（模板里直接挂 @update:value → handleSearch），不必点按钮
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
  searchParams.has_note = false;
  clearSymbolOptions();
  fetchData();
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
  await executeSync(syncGroup, syncLoading, fetchData);
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

// ---------------- 持仓笔记（开仓逻辑 / 策略与计划 / 证伪条件 / 复盘结论 / 主题） ----------------
const showNoteModal = ref(false);
const noteLoading = ref(false);
const noteTarget = ref<Api.Bills.GroupSymbol | null>(null);

// 空串统一转 null：后端把空串也归一为 NULL，这里保持一致，避免 '' 与 NULL 两种「空」
function toNoteText(val: string | null | undefined) {
  const txt = (val ?? '').trim();
  return txt === '' ? null : txt;
}

const noteForm = reactive<{
  logic: string | null;
  plan: string | null;
  invalidate: string | null;
  review: string | null;
  theme: string | null;
}>({ logic: null, plan: null, invalidate: null, review: null, theme: null });

// 主题候选：预设常用主题 + 当前页已出现的主题（可自由输入新值）
const themeOptions = computed(() => {
  const preset = ['黄金', 'IC贴水', '红利', '债券', '海外'];
  const used = tableData.value.map(r => r.theme).filter((t): t is string => !!t);
  return Array.from(new Set([...preset, ...used])).map(t => ({ label: t, value: t }));
});

function handleEditNote(row: Api.Bills.GroupSymbol) {
  noteTarget.value = row;
  noteForm.logic = row.logic ?? null;
  noteForm.plan = row.plan ?? null;
  noteForm.invalidate = row.invalidate ?? null;
  noteForm.review = row.review ?? null;
  noteForm.theme = row.theme ?? null;
  showNoteModal.value = true;
}

function handleNoteCancel() {
  showNoteModal.value = false;
  noteTarget.value = null;
  noteForm.logic = null;
  noteForm.plan = null;
  noteForm.invalidate = null;
  noteForm.review = null;
  noteForm.theme = null;
}

async function handleNoteSubmit() {
  if (!noteTarget.value) return;
  noteLoading.value = true;
  try {
    // 五个字段全量传：未改的字段后端比对后不会写留痕，清空则传空串
    const { data, error } = await updateGroupSymbolNote(noteTarget.value.id, {
      logic: toNoteText(noteForm.logic),
      plan: toNoteText(noteForm.plan),
      invalidate: toNoteText(noteForm.invalidate),
      review: toNoteText(noteForm.review),
      theme: toNoteText(noteForm.theme)
    });
    if (!error) {
      window.$message?.success(data?.message || '保存成功');
      showNoteModal.value = false;
      noteTarget.value = null;
      fetchData();
    }
  } finally {
    noteLoading.value = false;
  }
}

const columns = [
  { title: '交易分类', key: 'category', width: 80 },
  {
    // 代码同时是操作入口：点击打开持仓笔记弹窗（原「操作」列已取消）
    title: '代码',
    key: 'symbol',
    width: 200,
    // 不折行：19 字符的最长合约代码（如 CFFEX.IO2611-P-4000）要能一行显示。
    // 表格窄于 scrollX 时由横向滚动承载，而不是压缩列宽把代码挤成两行。
    // ⚠️ 用 span 而不是 NButton：naive-ui 按钮样式带 user-select:none，代码没法选中复制
    render: (row: Api.Bills.GroupSymbol) =>
      h(
        'span',
        {
          class: 'cursor-pointer whitespace-nowrap text-primary hover:underline',
          style: 'user-select: text',
          title: '点击编辑持仓笔记（可拖选代码复制）',
          onClick: () => {
            // 拖选文字后也会派发 click：有选区就不弹窗，否则选完立刻被弹窗打断
            if (window.getSelection()?.toString()) return;
            handleEditNote(row);
          }
        },
        row.symbol
      )
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
  { title: '盈亏合计', key: 'pfl_all', width: 100, align: 'right' as const, render: renderRate },
  {
    // TEXT 可能几百字：单行截断 + tooltip 显示全文，换行折成空格便于扫视
    title: '开仓逻辑',
    key: 'logic',
    width: 240,
    ellipsis: { tooltip: true },
    render: (row: Api.Bills.GroupSymbol) => (row.logic ? row.logic.replace(/\s*\n\s*/g, ' ') : '-')
  }
];

// 横向滚动宽度 = 各列宽之和：scroll-x 小于该值会压缩列宽，把代码列挤成两行
const scrollX = columns.reduce((sum, col) => sum + (col.width as number), 0);

onMounted(() => {
  fetchData();
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
            placeholder="单选精确匹配"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="代码">
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
        <NFormItem label="">
          <NCheckbox v-model:checked="searchParams.has_note" @update:checked="handleSearch">仅有笔记</NCheckbox>
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton type="primary" :loading="syncLoading" @click="handleSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            行情
          </NButton>
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

    <NModal v-model:show="showNoteModal" preset="card" title="持仓笔记" class="w-720px" :mask-closable="false">
      <div v-if="noteTarget" style="margin-bottom: 12px; color: #666; font-size: 13px">
        {{ noteTarget.category }} · {{ noteTarget.symbol }}
        <span v-if="noteTarget.note_at" style="margin-left: 8px; color: #999">
          （首次落笔 {{ noteTarget.note_at.replace('T', ' ').slice(0, 16) }}）
        </span>
      </div>
      <NForm :model="noteForm" label-placement="top">
        <NFormItem label="开仓逻辑">
          <NInput
            v-model:value="noteForm.logic"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            placeholder="当时的核心假设，用当时的原话，不做事后润色"
          />
        </NFormItem>
        <NFormItem label="策略与计划">
          <NInput
            v-model:value="noteForm.plan"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            placeholder="条件句：触发价 → 动作；加减仓、移仓、对冲都写在这里"
          />
        </NFormItem>
        <NFormItem label="证伪条件">
          <NInput
            v-model:value="noteForm.invalidate"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            placeholder="必须可量化（禁「分位偏高」这类说法）；与止损位分开写"
          />
        </NFormItem>
        <NFormItem label="复盘结论">
          <NInput
            v-model:value="noteForm.review"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            placeholder="平仓或阶段回看时写"
          />
        </NFormItem>
        <NFormItem label="主题标签">
          <NSelect
            v-model:value="noteForm.theme"
            :options="themeOptions"
            filterable
            tag
            clearable
            placeholder="黄金 / IC贴水 / 红利…（可输入新标签，跨合约聚合用）"
            style="width: 260px"
          />
        </NFormItem>
        <div style="color: #999; font-size: 12px">
          注：笔记为手动维护，行情同步与批量导入不会覆盖；每次修改留痕存于 bills_group_symbol_note_log。
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleNoteCancel">取消</NButton>
          <NButton type="primary" :loading="noteLoading" @click="handleNoteSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
