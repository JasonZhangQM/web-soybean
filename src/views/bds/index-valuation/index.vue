<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { fetchIndexValuationsPaged, syncIndexValuation } from '@/service/api';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'IndexValuationPage' });

/**
 * 指数估值原始数据（`bds_index_valuation`）
 *
 * 分工：本页只做**原始数据展示**（行式分页 + 筛选 + 重算），图表/分位统计在
 * `/irs/index-valuation`。与「中国宏观」的分工同构——`/bds/macro-research/economic-indicators`
 * 是纯表，`/irs/macro-framework` 是纯图表。
 *
 * ⚠️ 本表是**可重算的派生表**，不是不可变事实表：补成分快照、个股估值源数据覆盖、
 * 财报追溯调整都会改写历史行。故必须展示 `calc_at`（本行算于何时）与
 * `snapshot_date`（用的哪天确认的成分），否则读到异常值无从追溯。
 */

const bdsStore = useBdsStore();
const router = useRouter();
const message = useMessage();

// 指数代码下拉：与指数行情页同一数据源（store 异步加载，computed 保证响应式）
bdsStore.loadIndexCodes();
const indexOptions = computed(() => bdsStore.getIndexCodeOptions());

const loading = ref(false);
// 重算专用 loading：与表格 loading 分离，避免重算过程中表格闪烁
const syncing = ref(false);
const tableData = ref<Api.Bds.IndexValuationRow[]>([]);

// 搜索参数：index_codes 多选精确匹配，date_range 为 [起, 止]
// ⚠️ 须在 pagination 之前声明（§4.2：反序会报 TS2448）
const searchParams = reactive<{
  index_codes?: string[] | null;
  date_range?: [string, string] | null;
}>({});
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

/** 数值格式化：Pydantic 把 Decimal 序列化为字符串，一律 Number() 后再判空 */
function fmtNum(v: unknown, digits = 2): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '-';
}

/** 元 → 万亿 */
function fmtTrillion(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? (n / 1e12).toFixed(2) : '-';
}

/** 元 → 亿；负值（成分整体亏损）以警示色返回 VNode */
function fmtYi(v: unknown) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const text = (n / 1e8).toFixed(2);
  // 净利润合计为负 ⇒ 整体亏损，PE 只能靠亏损计入口径才有意义，属需注意的信号
  return n < 0 ? h('span', { style: 'color: #e24b4a; font-weight: 600' }, text) : text;
}

/** 亏损家数 > 0 时用橙色提示（占比越高，整体法 PE 越依赖亏损计入口径） */
function fmtLoss(v: unknown) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n > 0 ? h('span', { style: 'color: #ef9f27' }, String(n)) : String(n);
}

/** 计算时间：只显示到分钟，日期部分省略当年年份以省宽度 */
function fmtCalcAt(v: string | null): string {
  if (!v) return '-';
  return v.slice(5, 16).replace('T', ' ');
}

const columns = [
  { title: '指数代码', key: 'index_code', width: 115 },
  { title: '指数名称', key: 'sec_name', width: 100 },
  { title: '交易日期', key: 'trade_date', width: 105 },
  {
    title: '收盘价',
    key: 'close',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.close)
  },
  {
    title: 'PE(TTM)',
    key: 'pe_ttm',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pe_ttm)
  },
  {
    title: '中位PE',
    key: 'pe_median',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pe_median)
  },
  {
    title: 'PB(MRQ)',
    key: 'pb_mrq',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pb_mrq)
  },
  {
    title: '股息率%',
    key: 'dy_ttm',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.dy_ttm)
  },
  {
    title: '成分市值(万亿)',
    key: 'mv_total',
    width: 120,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtTrillion(r.mv_total)
  },
  {
    title: '净利合计(亿)',
    key: 'profit_total',
    width: 120,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtYi(r.profit_total)
  },
  {
    title: '成分数',
    key: 'n_total',
    width: 75,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => String(r.n_total ?? '-')
  },
  {
    title: '有效数',
    key: 'n_valid',
    width: 75,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => String(r.n_valid ?? '-')
  },
  {
    title: '亏损数',
    key: 'n_loss',
    width: 75,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtLoss(r.n_loss)
  },
  {
    title: '成分快照',
    key: 'snapshot_date',
    width: 105,
    render: (r: Api.Bds.IndexValuationRow) => r.snapshot_date || '-'
  },
  { title: '计算时间', key: 'calc_at', width: 115, render: (r: Api.Bds.IndexValuationRow) => fmtCalcAt(r.calc_at) }
];

/** 表格行键：指数 + 日期唯一（多指数同日不会撞键） */
function rowKey(r: Api.Bds.IndexValuationRow) {
  return `${r.index_code}-${r.trade_date}`;
}

async function fetchData() {
  loading.value = true;
  try {
    const [start, end] = searchParams.date_range || [];
    const { data, error } = await fetchIndexValuationsPaged({
      index_codes: searchParams.index_codes?.length ? searchParams.index_codes : undefined,
      start_date: start || undefined,
      end_date: end || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (error) {
      message.error((error as any)?.message || '指数估值获取失败');
      return;
    }
    tableData.value = data?.items || [];
    // 18k 行 COUNT(*) 实测 0.17 s，后端返回精确值，total_is_estimated 恒 false
    setPaginationTotal(pagination, data?.total || 0, data?.total_is_estimated);
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchParams.index_codes = null;
  searchParams.date_range = null;
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

/** 重算最近 5 个交易日（覆盖财报修订导致的 PE 跳变）；全历史重建走命令行脚本 */
async function handleRecalc() {
  syncing.value = true;
  try {
    const { data, error } = await syncIndexValuation({ days: 5 });
    if (error) {
      message.error((error as any)?.message || '重算失败');
      return;
    }
    const rows = Object.values(data?.result || {}).reduce((s: number, v: any) => s + (v?.rows || 0), 0);
    message.success(`重算完成，自 ${data?.start_date} 起写入 ${rows} 行`);
    await fetchData();
  } finally {
    syncing.value = false;
  }
}

/** 跳 IRs 图表页；把当前筛选的指数带过去，避免跳过去还要重选 */
function goChart() {
  const codes = searchParams.index_codes?.length ? searchParams.index_codes.join(',') : undefined;
  router.push({ name: 'irs_index-valuation', query: codes ? { index_codes: codes } : {} });
}

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="指数">
          <NSelect
            v-model:value="searchParams.index_codes"
            multiple
            clearable
            filterable
            :options="indexOptions"
            placeholder="不选=全部"
            style="min-width: 300px"
            max-tag-count="responsive"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="交易日期">
          <NDatePicker
            v-model:formatted-value="searchParams.date_range"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 280px"
            @update:formatted-value="handleSearch"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NSpace>
            <NButton :loading="loading" @click="fetchData">
              <template #icon><SvgIcon icon="mdi:refresh" /></template>
              刷新
            </NButton>
            <NButton type="primary" ghost :loading="syncing" @click="handleRecalc">重算最近5日</NButton>
            <NButton type="info" ghost @click="goChart">
              <template #icon><SvgIcon icon="mdi:chart-line" /></template>
              查看图表
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>
      <div class="mt-8px text-12px" style="color: #999">
        本表是
        <b>可重算的派生表</b>
        ：补成分快照、财报追溯调整都会改写历史行。 「成分快照」= 该行用的哪天确认的成分名单；「计算时间」=
        这行算于何时。分位统计与曲线见 IRs →「指数分位」。
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :row-key="rowKey"
        :scroll-x="1640"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
