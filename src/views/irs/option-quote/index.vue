<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchOptionMarket, fetchOptionMarketFilters, syncOptionMarket, fetchSyncTask } from '@/service/api';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IrsOptionQuotePage' });

/**
 * 期权 T 型报价（数据源：bds 期权行情 `bds_option_market`，2026-10-29 起替代 irs_option_monitor）
 *
 * - 查询走 `GET /bds/option-market?latest_only=true`：只取当前筛选范围内最新交易日的快照
 *   （品种级最新，某品种当日漏同步也不会因全局最新日而查空）；
 * - 「行情」同步走 bds 一键全量任务（POST /bds/option-market/sync，后台任务 + 轮询），
 *   同步对象是同步清单里全部启用合约，与当前页面筛选无关；
 * - 结算价/delta 只有商品期权有、ETF 无量数据等口径详见 bds 行情页，本页只展示 T 型所需字段。
 */

const message = useMessage();

// T 型报价行结构：同一行权价对应的 call/put 合约及中心轴字段
interface OptionQuoteRow {
  price_strike: number;
  call: Api.Bds.OptionMarket | null;
  put: Api.Bds.OptionMarket | null;
  // 中心轴字段（从 call 或 put 取；行级取值，混月时各行显示自己的到期信息）
  atm_i: number | null;
  price_ud: number | null;
  delisted_date: string | null;
  days_left: number | null;
}

const loading = ref(false);
// 原始期权行情数据（最新交易日快照）
const rawData = ref<Api.Bds.OptionMarket[]>([]);
// T 型报价行数据（按行权价降序）
const tableData = ref<OptionQuoteRow[]>([]);

// 默认参数：品种为沪深300股指期权；到期月默认空（用户按需选择，避免误看错月份）
const searchParams = reactive({
  option_name: '沪深300股指期权' as string | null,
  end_month: null as string | null
});

// 下拉选项（品种 / 到期月，均来自 bds 行情表真实数据，选了就有结果）
const optionNameOptions = ref<{ label: string; value: string }[]>([]);
const endMonthOptions = ref<{ label: string; value: string }[]>([]);

// 同步行情专用 loading（任务化：发起 + 轮询期间保持）
const syncLoading = ref(false);

// 分页配置（复用全局工厂函数）
const pagination = createTablePagination();
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

// 数值字段统一保留两位小数，空值显示 '-'（ORM Decimal 序列化为字符串，Number() 兼容）
const fmt = (v: string | number | null | undefined) => (v != null ? Number(v).toFixed(2) : '-');
// 期权现价、时间价值、内在价值保留四位小数
const fmt4 = (v: string | number | null | undefined) => (v != null ? Number(v).toFixed(4) : '-');

// 拉取期权行情（latest_only 只取筛选范围内最新交易日快照，一次拉全后前端分页）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionMarket({
      option_name: searchParams.option_name || undefined,
      end_month: searchParams.end_month || undefined,
      latest_only: true,
      limit: 500,
      offset: 0
    });
    if (!error) {
      rawData.value = data.items;
      tableData.value = transformToQuoteRows(rawData.value);
      pagination.itemCount = tableData.value.length;
      pagination.page = 1;
    }
  } finally {
    loading.value = false;
  }
}

// 分页切片：当前页数据
const pagedData = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return tableData.value.slice(start, start + pagination.pageSize);
});

// 平值行：行权价与标的现价绝对价差最小（基于全量数据）
// 使用 price_ud 而非派生字段 atm_i，行情源缺标的价时只要有缓存值仍可识别
const minAtmStrike = computed(() => {
  const valid = tableData.value.filter(r => r.price_ud != null);
  if (!valid.length) return null;
  let minRow = valid[0];
  for (const r of valid) {
    const diff = Math.abs(Number(r.price_strike) - Number(r.price_ud));
    const minDiff = Math.abs(Number(minRow.price_strike) - Number(minRow.price_ud));
    if (diff < minDiff) minRow = r;
  }
  return minRow.price_strike;
});

// 平值(%)绝对值最小的行整行加粗
function rowClassName(row: OptionQuoteRow) {
  return row.price_strike === minAtmStrike.value ? 'font-bold' : '';
}

function handlePageChange(page: number) {
  pagination.page = page;
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
}

// 拉取下拉选项：品种 + 到期月（bds 行情表里真有数据的月份，保证选了就有结果）
async function fetchOptions() {
  const { data, error } = await fetchOptionMarketFilters();
  if (!error && data) {
    optionNameOptions.value = data.option_names.map(n => ({ label: n, value: n }));
    endMonthOptions.value = data.end_months.map(m => ({
      label: `${m.slice(0, 4)}-${m.slice(4)}`,
      value: m
    }));
  }
}

// 将原始行情数据转换为 T 型报价行：按行权价分组，call/put 配对
function transformToQuoteRows(items: Api.Bds.OptionMarket[]): OptionQuoteRow[] {
  const groupMap = new Map<number, OptionQuoteRow>();
  for (const item of items) {
    let row = groupMap.get(item.price_strike);
    if (!row) {
      row = {
        price_strike: item.price_strike,
        call: null,
        put: null,
        atm_i: null,
        price_ud: null,
        delisted_date: null,
        days_left: null
      };
      groupMap.set(item.price_strike, row);
    }
    // 按期权类型拆分到 call 或 put
    if (item.option_type === 'call') {
      row.call = item;
    } else if (item.option_type === 'put') {
      row.put = item;
    }
    // 中心轴字段从 call 或 put 取（优先 call）
    row.atm_i = row.call?.atm_i ?? row.put?.atm_i ?? null;
    row.price_ud = row.call?.price_ud ?? row.put?.price_ud ?? null;
    row.delisted_date = (row.call ?? row.put)?.delisted_date?.slice(0, 10) ?? null;
    row.days_left = (row.call ?? row.put)?.days_left ?? null;
  }
  // 按行权价降序排列
  return Array.from(groupMap.values()).sort((a, b) => b.price_strike - a.price_strike);
}

function handleSearch() {
  fetchData();
}

// ===================== 行情同步（bds 任务化：一键全量 + 轮询） =====================

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
    if (!['pending', 'running'].includes(data.status)) {
      stopPolling();
      syncLoading.value = false;
      onSyncFinished(data);
    }
  }, 2000);
}

/** 收尾提示（简化版：只报组级成败，明细看 bds 行情页的任务审计） */
function onSyncFinished(task: Api.Bds.SyncTask) {
  if (task.status === 'failed') {
    message.error(`同步失败：${task.errors?.[0]?.message || '未知错误'}`);
    return;
  }
  if (task.status === 'stopped') {
    message.warning('同步已停止（已完成的部分已入库）');
    fetchData();
    return;
  }
  const r = (task.result || {}) as any;
  const text = `同步完成：${r.group_ok ?? 0}/${r.group_total ?? 0} 组`;
  if (task.status === 'done' && (r.group_failed ?? 0) > 0) {
    message.warning(`${text}，${r.group_failed} 组失败，详见 bds 行情页任务审计`);
  } else {
    message.success(text);
  }
  fetchData();
}

// 触发行情同步（同步清单内全部启用合约，与当前页面筛选无关）
async function handleSync() {
  if (syncLoading.value) return;
  syncLoading.value = true;
  const { data, error } = await syncOptionMarket();
  if (error || !data) {
    syncLoading.value = false;
    message.error((error as any)?.message || '发起同步失败（清单为空时请先在 bds 行情页配置）');
    return;
  }
  startPolling(data.id);
}

// 生成认购侧列（取 row.call 的字段），formatter/className 可选
function makeCallColumn(
  title: string,
  field: keyof Api.Bds.OptionMarket,
  key: string,
  width = 90,
  formatter = fmt,
  className?: string
) {
  return {
    title,
    key,
    width,
    className,
    render: (row: OptionQuoteRow) => formatter(row.call?.[field] as number | null)
  };
}

// 生成认沽侧列（取 row.put 的字段），formatter/className 可选
function makePutColumn(
  title: string,
  field: keyof Api.Bds.OptionMarket,
  key: string,
  width = 90,
  formatter = fmt,
  className?: string
) {
  return {
    title,
    key,
    width,
    className,
    render: (row: OptionQuoteRow) => formatter(row.put?.[field] as number | null)
  };
}

// 中心轴列（行权价、标的现价、平值%），加粗突出
function makeAxisColumn(title: string, field: keyof OptionQuoteRow, width = 90) {
  return {
    title,
    key: field as string,
    width,
    className: 'font-bold',
    render: (row: OptionQuoteRow) => fmt(row[field] as number | null)
  };
}

// 到期日(剩余天数)列：日期字符串 + 括号天数，不走数值 fmt
function makeExpiryColumn() {
  return {
    title: '到期日(天数)',
    key: 'delisted_date',
    width: 130,
    className: 'font-bold',
    render: (row: OptionQuoteRow) => `${row.delisted_date ?? '-'}（${row.days_left ?? '-'}）`
  };
}

const columns = [
  // 认购侧（7 列，从左到右）
  makeCallColumn('内在(%Y)', 'ratio_i_y', 'call_ratio_i_y', 90, fmt, 'font-bold'),
  makeCallColumn('内在(%)', 'ratio_i', 'call_ratio_i'),
  makeCallColumn('内在价值', 'value_i', 'call_value_i', 100, fmt4),
  makeCallColumn('时间(%Y)', 'ratio_t_y', 'call_ratio_t_y', 90, fmt, 'font-bold'),
  makeCallColumn('时间(%)', 'ratio_t', 'call_ratio_t'),
  makeCallColumn('时间价值', 'value_t', 'call_value_t', 100, fmt4),
  makeCallColumn('期权现价', 'price', 'call_price', 100, fmt4),
  // 中心轴（4 列）：行权价 → 标的现价 → 平值(%) → 到期日(剩余天数)
  makeAxisColumn('行权价', 'price_strike'),
  makeAxisColumn('标的现价', 'price_ud'),
  makeAxisColumn('平值(%)', 'atm_i', 90),
  makeExpiryColumn(),
  // 认沽侧（7 列，从左到右）
  makePutColumn('期权现价', 'price', 'put_price', 100, fmt4),
  makePutColumn('时间价值', 'value_t', 'put_value_t', 100, fmt4),
  makePutColumn('时间(%)', 'ratio_t', 'put_ratio_t'),
  makePutColumn('时间(%Y)', 'ratio_t_y', 'put_ratio_t_y', 90, fmt, 'font-bold'),
  makePutColumn('内在价值', 'value_i', 'put_value_i', 100, fmt4),
  makePutColumn('内在(%)', 'ratio_i', 'put_ratio_i'),
  makePutColumn('内在(%Y)', 'ratio_i_y', 'put_ratio_i_y', 90, fmt, 'font-bold')
];

onMounted(() => {
  fetchOptions();
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
            filterable
            clearable
            placeholder="全部"
            style="width: 200px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NSelect
            v-model:value="searchParams.end_month"
            :options="endMonthOptions"
            clearable
            placeholder="全部"
            style="width: 150px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NButton @click="handleSearch">搜索</NButton>
        </NFormItem>
        <!-- 操作按钮区：整体靠右 -->
        <NFormItem class="ml-auto">
          <NButton :loading="syncLoading" @click="handleSync">
            <template #icon><SvgIcon icon="mdi:sync" /></template>
            行情
          </NButton>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="pagedData"
        :loading="loading"
        :pagination="pagination"
        :row-class-name="rowClassName"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>

<style scoped>
/* 表格单元格不换行：18 列的 T 型报价换行会撑高行、破坏紧凑对照布局 */
:deep(.n-data-table .n-data-table-th),
:deep(.n-data-table .n-data-table-td) {
  white-space: nowrap;
}
</style>
