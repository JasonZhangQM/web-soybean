<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, h } from 'vue';
import { useMessage } from 'naive-ui';
import {
  deleteOptionConfig,
  fetchOptionConfigs,
  fetchOptionMarket,
  fetchOptionMarketFilters,
  fetchOptionMarketLatestDate,
  fetchOptionSyncPlan,
  fetchSyncTask,
  backfillOptionConfigSpec,
  syncOptionMarket,
  updateOptionConfig
} from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'OptionMarketPage' });

/**
 * 期权行情（`bds_option_market`）
 *
 * 数据由**配置驱动**同步：`bds_option_config` 决定"要同步哪些合约"，
 * 点搜索区的「行情同步」一次拉完（后台任务 + 进度 + 审计落库）。
 *
 * 三个必须先知道的展示口径（否则会把 null 当成数据缺失）：
 * 1. `settle`（结算价）**只有商品期权拿得到**——股指与 ETF 期权的 akshare 接口本来就没有
 *    这个字段，所以显示 `-` 并带 tooltip，**不拿前结价冒充**（会误导风险计算）。
 * 2. `delta_opt` 同理，只有商品期权有（认沽为负）。
 * 3. `volume` / `open_interest` 对 ETF 恒为 null：接口的「数量」列实测恒等于返回行数
 *    （26 行全是 26），不是成交量，宁缺勿造。
 *
 * ⚠️ symbol 三品种三种写法：IO 是 `IO2611-P-4000`、au 是 `au2612P840`（去账单前缀即可），
 * 但 ETF 的券商码 `SHQQ.10012562` 与交易所码 `P2611M06250` **没有任何字符串关系**，
 * 所以单独显示「券商码」列，对账时才不会对不上。
 */

const message = useMessage();
// 项目惯例：dialog 走 window.$dialog（AppProvider 在 provider 内部注册），
// 页面里直接 useDialog() 拿不到 provider 上下文
const dialog = window.$dialog;

const loading = ref(false);
const tableData = ref<Api.Bds.OptionMarket[]>([]);
const pagination = createTablePagination();

// 筛选条件（searchParams 必须在 pagination 之前声明，反序会报 TS2448）
const searchParams = reactive<{
  option_name?: string | null;
  end_month?: string | null;
  option_type?: string | null;
  symbol?: string | null;
  trade_date?: string | null;
}>({});
usePageState({ searchParams, pagination });

const filters = ref<Api.Bds.OptionMarketFilters>({ option_names: [], end_months: [], und_keys: [] });
const latest = ref<Api.Bds.OptionMarketLatestDate>({
  latest_trade_date: null,
  by_und: {},
  sync_time: null
});

const UND_LABEL: Record<string, string> = {
  csi300: '沪深300股指',
  csi500etf: '500ETF',
  au: '沪金'
};

const optionNameOptions = computed(() => filters.value.option_names.map(n => ({ label: n, value: n })));
const endMonthOptions = computed(() =>
  filters.value.end_months.map(m => ({ label: `${m.slice(0, 4)}-${m.slice(4)}`, value: m }))
);
const typeOptions = [
  { label: '认沽', value: 'put' },
  { label: '认购', value: 'call' }
];

/** 价格：小面值（ETF 0.08 级）保留 4 位，大面值（IO/黄金）2 位 */
function fmtPx(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) < 10 ? n.toFixed(4) : n.toFixed(2);
}

/** 行权价：整数不显示小数（4000 / 6.25） */
function fmtStrike(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '-';
}

/** 该品种接口是否提供该字段（决定 `-` 是"接口不提供"还是"数据缺失"） */
const NO_SETTLE_UND = ['csi300', 'csi500etf'];

/** 缺失值渲染：带 tooltip 说明「接口不提供」，避免被当成同步失败 */
function dash(title: string) {
  return h('span', { style: 'color: #bbb', title }, '-');
}

function fmtMissing(v: unknown, title: string, digits = 4) {
  if (v === null || v === undefined || v === '') return dash(title);
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : dash(title);
}

const columns = [
  { title: '代码', key: 'symbol', width: 175 },
  {
    title: '券商码',
    key: 'broker_symbol',
    width: 145,
    render: (r: Api.Bds.OptionMarket) =>
      r.broker_symbol || h('span', { style: 'color: #bbb', title: '仅 ETF 期权有券商柜台码' }, '-')
  },
  {
    title: '品种',
    key: 'und_key',
    width: 100,
    render: (r: Api.Bds.OptionMarket) => UND_LABEL[r.und_key] || r.und_key
  },
  {
    title: '类型',
    key: 'option_type',
    width: 70,
    render: (r: Api.Bds.OptionMarket) =>
      h(
        'span',
        { style: r.option_type === 'put' ? 'color:#2f9e6e' : 'color:#d03050' },
        r.option_type === 'put' ? '认沽' : '认购'
      )
  },
  {
    title: '行权价',
    key: 'price_strike',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtStrike(r.price_strike)
  },
  { title: '到期日', key: 'delisted_date', width: 110, render: (r: Api.Bds.OptionMarket) => r.delisted_date || '-' },
  {
    title: '剩余天',
    key: 'days_left',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => (r.days_left == null ? '-' : String(r.days_left))
  },
  {
    title: '现价',
    key: 'price',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.price)
  },
  {
    title: '结算价',
    key: 'settle',
    width: 95,
    align: 'right' as const,
    // 股指/ETF 的接口根本没有结算价字段 ⇒ 明确留空，不拿前结价顶替（会误导保证金计算）
    render: (r: Api.Bds.OptionMarket) =>
      NO_SETTLE_UND.includes(r.und_key) ? dash('该品种接口不提供结算价（仅商品期权有）') : fmtPx(r.settle)
  },
  {
    title: '标的价',
    key: 'price_ud',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.price_ud)
  },
  {
    title: '内在价值',
    key: 'value_i',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.value_i)
  },
  {
    title: '时间价值',
    key: 'value_t',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) => fmtPx(r.value_t)
  },
  {
    title: 'delta',
    key: 'delta_opt',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      NO_SETTLE_UND.includes(r.und_key)
        ? dash('该品种接口不提供 delta（仅商品期权有）')
        : fmtMissing(r.delta_opt, 'delta', 4)
  },
  {
    title: '成交量',
    key: 'volume',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      r.volume == null
        ? dash('该品种接口的成交量字段不可信（ETF 的「数量」列恒等于返回行数），故留空')
        : String(r.volume)
  },
  {
    title: '持仓量',
    key: 'open_interest',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.OptionMarket) =>
      r.open_interest == null ? dash('该品种接口不提供持仓量') : String(r.open_interest)
  },
  { title: '行情日期', key: 'trade_date', width: 110 }
];

/** scroll-x 必须 ≥ 列宽和，否则 naive-ui 会压缩列导致折行（§4.11） */
const scrollX = computed(() => columns.reduce((sum, c) => sum + (c.width || 0), 0));

/** 行键：主键即唯一（表有 uk(symbol, trade_date)，id 稳定） */
function marketRowKey(r: Api.Bds.OptionMarket) {
  return r.id;
}

/** 配置行键 */
function configRowKey(r: Api.Bds.OptionConfig) {
  return r.id;
}

// ===================== 查询 =====================

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionMarket({
      option_name: searchParams.option_name || undefined,
      end_month: searchParams.end_month || undefined,
      option_type: searchParams.option_type || undefined,
      symbol: searchParams.symbol || undefined,
      trade_date: searchParams.trade_date || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (error) {
      message.error((error as any)?.message || '期权行情获取失败');
      return;
    }
    tableData.value = data?.items || [];
    setPaginationTotal(pagination, data?.total || 0, data?.total_is_estimated);
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  const [f, l] = await Promise.all([fetchOptionMarketFilters(), fetchOptionMarketLatestDate()]);
  if (!f.error && f.data) filters.value = f.data;
  if (!l.error && l.data) latest.value = l.data;
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.option_name = null;
  searchParams.end_month = null;
  searchParams.option_type = null;
  searchParams.symbol = null;
  searchParams.trade_date = null;
  pagination.page = 1;
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

// ===================== 行情同步（任务化 + 按组进度） =====================

const syncLoading = ref(false);
const syncTask = ref<Api.Bds.SyncTask | null>(null);
const syncRunning = computed(() => ['pending', 'running'].includes(syncTask.value?.status || ''));
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(taskId: number) {
  stopPolling();
  pollTimer = setInterval(async () => {
    const { data, error } = await fetchSyncTask(taskId);
    if (error || !data) return;
    syncTask.value = data;
    if (!['pending', 'running'].includes(data.status)) {
      stopPolling();
      syncLoading.value = false;
      onSyncFinished(data);
    }
  }, 2000);
}

/** 收尾提示：把「新增/更新/跳过/失败」讲清楚，跳过要看得出是价格 0 还是格式不符 */
function onSyncFinished(task: Api.Bds.SyncTask) {
  const r = (task.result || {}) as any;
  if (task.status === 'failed') {
    message.error(`同步失败：${task.errors?.[0]?.message || '未知错误'}`);
    return;
  }
  if (task.status === 'stopped') {
    message.warning('同步已停止（已完成的部分已入库）');
    loadMeta();
    fetchData();
    return;
  }
  // 口径：本任务的 success_count = 写入行数，与批量同步页「段内项数」不是一回事，
  // 所以每个数字后面都带「行」，避免被读成项数
  const parts = [
    `成功 ${r.group_ok ?? 0}/${r.group_total ?? 0} 组`,
    `新增 ${r.row_insert ?? 0} 行`,
    `更新 ${r.row_update ?? 0} 行`,
    `跳过 ${r.row_skip ?? 0} 行`
  ];
  const skipDetail = Object.entries(r.per_group || {})
    .flatMap(([, g]: any) => (g.skip_reasons ? Object.entries(g.skip_reasons) : []))
    .map(([k, v]) => `${k}×${v}`)
    .join('、');
  const text = parts.join('，') + (skipDetail ? `（跳过原因：${skipDetail}）` : '');
  if (task.status === 'done' && (r.group_failed ?? 0) > 0) {
    message.warning(`${text}；${r.group_failed} 组失败，详见任务审计`);
  } else {
    message.success(text);
  }
  loadMeta();
  fetchData();
}

/** 点「行情同步」：先拿计划数 → 确认框讲清代价 → 起任务 → 轮询进度 */
async function handleSync() {
  if (syncRunning.value) return;
  syncLoading.value = true;
  try {
    const { data: plan, error } = await fetchOptionSyncPlan();
    if (error || !plan) {
      message.error((error as any)?.message || '取同步计划失败');
      return;
    }
    if (plan.symbol_count === 0) {
      message.warning('同步清单为空，请先点右侧「同步清单」添加合约');
      return;
    }
    const groupText = plan.groups
      .map(g => `${g.option_name}/${g.end_month === 'ALL' ? '全部月份' : g.end_month}`)
      .join('、');
    dialog?.info({
      title: '确认同步期权行情',
      content: () =>
        h('div', { style: 'line-height:1.9' }, [
          h(
            'div',
            `将同步 ${plan.symbol_count} 个合约，覆盖 ${plan.group_count} 个「品种×到期月」组合（= ${plan.group_count} 次接口请求）。`
          ),
          h('div', { style: 'color:#888;font-size:12px;margin-top:4px' }, groupText),
          h(
            'div',
            { style: 'color:#888;font-size:12px;margin-top:8px' },
            '按日快照入库：同一天重跑会覆盖，跨日累积成时间序列。'
          )
        ]),
      positiveText: '开始同步',
      negativeText: '取消',
      onPositiveClick: () => {
        doSync();
      }
    });
  } finally {
    // 取消时也要复位 loading（onPositiveClick 里会再置 true）
    if (!syncRunning.value) syncLoading.value = false;
  }
}

async function doSync() {
  syncLoading.value = true;
  syncTask.value = null;
  const { data, error } = await syncOptionMarket();
  if (error || !data) {
    syncLoading.value = false;
    message.error((error as any)?.message || '启动同步失败（可能有其他任务在跑）');
    return;
  }
  syncTask.value = data;
  startPolling(data.id);
}

/** 进度文案：必须显示「第几组/共几组」——耗时在接口请求上，只给百分比会长时间停 0% */
const syncProgressText = computed(() => {
  const t = syncTask.value;
  if (!t) return '';
  if (t.status === 'stopped') return '已停止';
  const total = t.total_count || 0;
  const done = t.done_count || 0;
  if (['done', 'failed'].includes(t.status)) return `完成 ${done}/${total} 组`;
  return `${done}/${total} 组进行中…`;
});

// ===================== 同步清单抽屉 =====================

const configDrawer = ref(false);
const configLoading = ref(false);
const configRows = ref<Api.Bds.OptionConfig[]>([]);
const backfilling = ref(false);

async function loadConfigs() {
  configLoading.value = true;
  try {
    const { data, error } = await fetchOptionConfigs();
    if (!error && data) configRows.value = data;
  } finally {
    configLoading.value = false;
  }
}

function openConfigDrawer() {
  configDrawer.value = true;
  loadConfigs();
}

async function toggleConfig(row: Api.Bds.OptionConfig, enabled: boolean) {
  const { error } = await updateOptionConfig(row.id, { is_enabled: enabled ? 1 : 0 });
  if (error) {
    message.error('更新失败');
    return;
  }
  row.is_enabled = enabled ? 1 : 0;
  message.success(enabled ? `已启用 ${row.symbol}` : `已停用 ${row.symbol}`);
}

function removeConfig(row: Api.Bds.OptionConfig) {
  dialog?.warning({
    title: '删除同步配置',
    content: `删除 ${row.symbol} 的同步配置？已同步的行情不会被删（行情是事实数据，删配置只影响后续同步范围）。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteOptionConfig(row.id);
      if (error) {
        message.error('删除失败');
        return;
      }
      message.success('已删除');
      loadConfigs();
    }
  });
}

async function backfillSpec() {
  backfilling.value = true;
  try {
    const { data, error } = await backfillOptionConfigSpec();
    if (error || !data) {
      message.error('补全失败');
      return;
    }
    const noData = data.no_data.length;
    if (noData) {
      message.warning(`补全 ${data.filled} 条，跳过 ${data.skipped} 条，${noData} 条无行情快照`);
    } else {
      message.success(`补全 ${data.filled} 条，跳过 ${data.skipped} 条`);
    }
    loadConfigs();
  } finally {
    backfilling.value = false;
  }
}

const configColumns = [
  { title: '代码', key: 'symbol', width: 160 },
  {
    title: '券商码',
    key: 'broker_symbol',
    width: 140,
    render: (r: Api.Bds.OptionConfig) => r.broker_symbol || '-'
  },
  { title: '品种', key: 'option_name', width: 150 },
  {
    title: '到期月',
    key: 'end_month',
    width: 90,
    render: (r: Api.Bds.OptionConfig) => (r.end_month === 'ALL' ? '全部月份' : r.end_month || '-')
  },
  {
    title: '启用',
    key: 'is_enabled',
    width: 80,
    render: (r: Api.Bds.OptionConfig) =>
      h('span', { style: `color:${r.is_enabled ? '#2f9e6e' : '#bbb'}` }, r.is_enabled ? '是' : '否')
  },
  {
    title: '规格',
    key: 'spec',
    width: 130,
    render: (r: Api.Bds.OptionConfig) => {
      const gaps = [
        !r.cp && '方向',
        !r.strike && 'K',
        !r.multiplier && '乘数',
        !r.margin_type && '保证金族',
        !r.expiry_date && '到期日'
      ].filter(Boolean);
      if (gaps.length) {
        return h('span', { style: 'color:#d03050' }, `缺 ${gaps.join('/')}`);
      }
      return h('span', { style: 'color:#666' }, `${r.cp} ${r.strike} ×${r.multiplier}`);
    }
  },
  { title: '备注', key: 'note', width: 200, render: (r: Api.Bds.OptionConfig) => r.note || '-' },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render: (r: Api.Bds.OptionConfig) =>
      h('div', { style: 'display:flex;gap:8px' }, [
        h(
          'span',
          {
            style: 'color:#2080f0;cursor:pointer;user-select:none',
            onClick: () => toggleConfig(r, !r.is_enabled)
          },
          r.is_enabled ? '停用' : '启用'
        ),
        h(
          'span',
          {
            style: 'color:#d03050;cursor:pointer;user-select:none',
            onClick: () => removeConfig(r)
          },
          '删除'
        )
      ])
  }
];

onMounted(() => {
  loadMeta();
  fetchData();
});

onUnmounted(stopPolling);
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="品种">
          <NSelect
            v-model:value="searchParams.option_name"
            :options="optionNameOptions"
            clearable
            placeholder="不选=全部"
            style="width: 170px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NSelect
            v-model:value="searchParams.end_month"
            :options="endMonthOptions"
            clearable
            placeholder="不选=全部"
            style="width: 130px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="searchParams.option_type"
            :options="typeOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="代码">
          <NInput
            v-model:value="searchParams.symbol"
            clearable
            placeholder="模糊匹配，回车搜索"
            style="width: 180px"
            @keyup.enter="handleSearch"
          />
        </NFormItem>
        <NFormItem label="行情日期">
          <NDatePicker
            v-model:formatted-value="searchParams.trade_date"
            type="date"
            value-format="yyyy-MM-dd"
            clearable
            placeholder="默认最新"
            style="width: 150px"
            @update:formatted-value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>

        <!-- 行情同步：搜索区的**批量任务按钮**（不针对某一行、走任务化、有审计） -->
        <NFormItem class="ml-auto">
          <NSpace align="center">
            <NButton @click="openConfigDrawer">
              <template #icon><SvgIcon icon="mdi:format-list-checks" /></template>
              同步清单
            </NButton>
            <NButton type="primary" :loading="syncLoading || syncRunning" @click="handleSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              行情同步
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>

      <!-- 同步进度：按「组」报，不给单纯百分比（耗时在接口请求上） -->
      <div v-if="syncTask" class="mt-8px">
        <NProgress
          type="line"
          :percentage="Number(syncTask.progress || 0)"
          :status="syncTask.status === 'failed' ? 'error' : syncTask.status === 'stopped' ? 'warning' : undefined"
          :processing="syncRunning"
        />
        <div class="mt-4px text-12px" style="color: #888">
          {{ syncProgressText }}
          <span v-if="syncTask.result && !syncRunning">
            · 新增 {{ (syncTask.result as any).row_insert ?? 0 }} 行 · 更新
            {{ (syncTask.result as any).row_update ?? 0 }} 行 · 跳过 {{ (syncTask.result as any).row_skip ?? 0 }} 行
          </span>
        </div>
        <div class="mt-4px text-12px" style="color: #999">
          进度按「组」（一个品种×到期月 = 一次接口请求）报，条数按
          <b>行</b>
          报——两者不同口径，别看混。
        </div>
      </div>

      <div class="mt-8px text-12px" style="color: #999">
        最新行情日：
        <b>{{ latest.latest_trade_date || '（暂无数据）' }}</b>
        <template v-if="latest.sync_time">· 最近同步 {{ latest.sync_time }}</template>
        · 数据由「
        <b>同步清单</b>
        」驱动，点「行情同步」一次拉完（后台任务，进度按组显示）。 「到期月」按
        <b>到期日所在月</b>
        筛选（au2612 的到期日在 11 月，故归入 202611；IO2611 与它同月）。
        <b>结算价 / delta 只有商品期权可得</b>
        ：股指与 ETF 期权的接口本就没有这两个字段，显示
        <span style="color: #bbb">-</span>
        是正常现象，不拿前结价冒充结算价。
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :row-key="marketRowKey"
        :scroll-x="scrollX"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <NDrawer v-model:show="configDrawer" :width="1200" placement="right">
      <NDrawerContent closable>
        <template #header>
          <div class="flex w-full items-center justify-between pr-16px">
            <span>期权行情同步清单</span>
            <NSpace>
              <NButton size="small" :loading="backfilling" @click="backfillSpec">
                <template #icon><SvgIcon icon="mdi:refresh" /></template>
                补全规格
              </NButton>
              <NButton size="small" :loading="configLoading" @click="loadConfigs">刷新</NButton>
            </NSpace>
          </div>
        </template>
        <div class="mb-8px text-12px" style="color: #999">
          这张清单既是「行情同步」的范围，也是合约规格（方向/行权价/乘数/保证金族/到期日）的唯一来源。
          规格留空没关系——行情同步会自动补全，也可点「补全规格」手工触发；但风险计算要求规格齐全，缺了会拒绝估算。
          商品期权（沪金）的到期月记为「全部月份」：接口一次返回当日全部到期月，填实际月份会让人以为只拉了一个月。
        </div>
        <NDataTable
          :columns="configColumns"
          :data="configRows"
          :loading="configLoading"
          :row-key="configRowKey"
          :scroll-x="1100"
          size="small"
        />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/* 列宽不足时 naive-ui 默认折行，不是省略号；统一 nowrap 保证一行显示（配 scroll-x 横向滚动） */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
