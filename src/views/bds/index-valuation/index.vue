<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { fetchIndexValuationsPaged } from '@/service/api';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'IndexValuationPage' });

/**
 * 指数估值原始数据（`bds_index_valuation`）
 *
 * 分工：本页只做**原始数据展示**（行式分页 + 筛选），图表/分位统计在
 * `/irs/index-valuation`。与「中国宏观」的分工同构——`/bds/macro-research/economic-indicators`
 * 是纯表，`/irs/macro-framework` 是纯图表。
 *
 * **本页不放写操作**：重算已任务化，收口到「批量同步 → 指数估值重算」卡片
 * （后台线程 + 进度轮询 + 停止 + 审计落库）。
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
  { title: '指数代码', key: 'index_code', width: 100 },
  { title: '指数名称', key: 'sec_name', width: 90 },
  { title: '交易日期', key: 'trade_date', width: 100 },
  {
    title: '收盘价',
    key: 'close',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.close)
  },
  {
    title: 'PE(TTM)',
    key: 'pe_ttm',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pe_ttm)
  },
  {
    title: '中位PE',
    key: 'pe_median',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pe_median)
  },
  {
    title: 'PB(MRQ)',
    key: 'pb_mrq',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.pb_mrq)
  },
  {
    title: '股息率%',
    key: 'dy_ttm',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.dy_ttm)
  },
  {
    title: 'PS(TTM)',
    key: 'ps_ttm',
    width: 80,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtNum(r.ps_ttm)
  },
  {
    title: 'PCF(TTM)',
    key: 'pcf_ttm_oper',
    width: 85,
    align: 'right' as const,
    // 与 PE 的口径故意不同：PCF 剔除了负现金流成分（见 n_cf_neg 列），
    // 所以它只代表「正现金流那部分成分」的市现率，不能当成全成分口径读
    render: (r: Api.Bds.IndexValuationRow) =>
      h('span', { title: '剔除负现金流成分后的整体法市现率' }, fmtNum(r.pcf_ttm_oper))
  },
  {
    title: '成分市值(万亿)',
    key: 'mv_total',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtTrillion(r.mv_total)
  },
  {
    title: '净利合计(亿)',
    key: 'profit_total',
    width: 100,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtYi(r.profit_total)
  },
  {
    title: '成分数',
    key: 'n_total',
    width: 80,
    align: 'right' as const,
    // 覆盖率 = 实际进样本数 / 该快照应有成分数；< 98% 时后端把 PE/PB/股息率置空，
    // 此处同步标橙，否则只看到"成分数 99"却不明白旁边指标为什么是空的
    render: (r: Api.Bds.IndexValuationRow) => {
      if (r.n_total == null) return '-';
      if (r.expected_total == null) return String(r.n_total);
      const text = `${r.n_total}/${r.expected_total}`;
      return r.n_total / r.expected_total < 0.98
        ? h('span', { style: 'color: #ef9f27; font-weight: 600' }, text)
        : text;
    }
  },
  {
    title: '有效数',
    key: 'n_valid',
    width: 70,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => String(r.n_valid ?? '-')
  },
  {
    title: '亏损数',
    key: 'n_loss',
    width: 70,
    align: 'right' as const,
    render: (r: Api.Bds.IndexValuationRow) => fmtLoss(r.n_loss)
  },
  {
    title: '负现金流数',
    key: 'n_cf_neg',
    width: 90,
    align: 'right' as const,
    // 不标警示色：负经营现金流是真实经济状态，不是数据缺陷（亏损数同理但 PE 会受影响，
    // 而 PCF 这里只影响样本范围）。占比高时 PCF 的代表性下降，靠 tooltip 说明即可
    render: (r: Api.Bds.IndexValuationRow) =>
      h(
        'span',
        { title: '负/无经营现金流成分数，这些成分不参与 PCF 计算' },
        r.n_cf_neg == null ? '-' : String(r.n_cf_neg)
      )
  },
  {
    title: '成分快照',
    key: 'snapshot_date',
    width: 100,
    render: (r: Api.Bds.IndexValuationRow) => r.snapshot_date || '-'
  },
  { title: '计算时间', key: 'calc_at', width: 100, render: (r: Api.Bds.IndexValuationRow) => fmtCalcAt(r.calc_at) }
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

/**
 * 跳批量同步页的「指数估值重算」卡片
 *
 * 本页**不放写操作**：重算已任务化（后台线程 + 进度 + 停止 + 审计落库），
 * 与成分股同步收口在同一处，避免同一件事有两个入口、两套状态。
 */
function goRecalc() {
  router.push({ name: 'batch-sync' });
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
            placeholder="全部"
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
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
        <NFormItem class="ml-auto">
          <NSpace>
            <NButton :loading="loading" @click="fetchData">
              <template #icon><SvgIcon icon="mdi:refresh" /></template>
              刷新
            </NButton>
            <NButton @click="goRecalc">去重算 →</NButton>
            <NButton @click="goChart">
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
        这行算于何时；「成分数」= 实际进样本数/该快照应有数，覆盖率低于 98% 时 PE/PB/股息率/PS/PCF
        一律留空并标橙（防止源端缺股时静默出数）。数据由「批量同步 → 指数估值重算」生成；分位统计与曲线见 IRs
        →「指数分位」。
        <b>PCF 口径与 PE 不同</b>
        ：PCF 只让正经营现金流的成分参与（分子分母同口径剔除），「负现金流数」列的成分不参与计算；PE
        则把亏损成分计入分母。
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
        :scroll-x="1860"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
