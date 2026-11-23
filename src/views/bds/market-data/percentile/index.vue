<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchValuationPercentiles } from '@/service/api';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { useBdsStore } from '@/store/modules/bds';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'ValuationPercentilePage' });

/**
 * 估值分位落盘原始数据（`bds_valuation_percentile`）
 *
 * 分工：本页只做**落盘数据展示**（行式分页 + 筛选），图表/实时分位在
 * `/irs/valuation-percent`。数据由「批量同步 → 估值分位落盘」任务生成，
 * 一行 = 一个标的的一个观察日；分位与 um 截面表（标的监测抽屉）同一内核产出。
 *
 * 窗口口径 A（2026-11-23 定稿）：窗口有效样本 n < 250（约一年交易日）⇒ 该窗口
 * 分位为 NULL，页面显示「—」（新股早期窗口 / 股息率 loss 日）。status_* 只描述
 * 当日值有效性（ok / loss / no_data），与窗口样本量解耦。
 */

const bdsStore = useBdsStore();
const message = useMessage();

// 标的代码下拉：与指数估值页同一数据源；tag 模式允许手输个股 gm 代码（如 SZSE.300750）
bdsStore.loadIndexCodes();
const symbolOptions = bdsStore.getIndexCodeOptions();

const loading = ref(false);
const tableData = ref<Api.Bds.ValuationPercentileRow[]>([]);

// 搜索参数：subject_type 单选、symbols 多选（可手输 gm 代码）、date_range 为 [起, 止]
// ⚠️ 须在 pagination 之前声明（§4.2：反序会报 TS2448）
const searchParams = reactive<{
  subject_type?: string | null;
  symbols?: string[] | null;
  date_range?: [string, string] | null;
}>({});
// 分页配置（remote 模式，使用全局工厂函数）
const pagination = createTablePagination();
// 会话记忆：切回本页时恢复筛选条件与页码
usePageState({ searchParams, pagination });

/** 数值格式化：Pydantic 把 Decimal 序列化为字符串，一律 Number() 后再判空 */
function fmtNum(v: unknown, digits = 1): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '-';
}

/** 计算时间：只显示到分钟，日期部分省略当年年份以省宽度 */
function fmtCalcAt(v: string | null): string {
  if (!v) return '-';
  return v.slice(5, 16).replace('T', ' ');
}

const TYPE_LABEL: Record<string, string> = { index: '指数', stock: '个股' };

/** 12 分位字段配置：key 与后端 schema 对齐；工厂生成统一列（60 宽、右对齐） */
const pctFieldConfigs: Array<{ key: keyof Api.Bds.ValuationPercentileRow; title: string }> = [
  { key: 'pe_pct_3y', title: 'PE 3年' },
  { key: 'pe_pct_5y', title: 'PE 5年' },
  { key: 'pe_pct_10y', title: 'PE 10年' },
  { key: 'pb_pct_3y', title: 'PB 3年' },
  { key: 'pb_pct_5y', title: 'PB 5年' },
  { key: 'pb_pct_10y', title: 'PB 10年' },
  { key: 'ps_pct_3y', title: 'PS 3年' },
  { key: 'ps_pct_5y', title: 'PS 5年' },
  { key: 'ps_pct_10y', title: 'PS 10年' },
  { key: 'dy_pct_3y', title: 'DY 3年' },
  { key: 'dy_pct_5y', title: 'DY 5年' },
  { key: 'dy_pct_10y', title: 'DY 10年' }
];

function makePctColumn(cfg: { key: keyof Api.Bds.ValuationPercentileRow; title: string }) {
  return {
    title: cfg.title,
    key: cfg.key,
    width: 60,
    align: 'right' as const,
    render: (row: Api.Bds.ValuationPercentileRow) => fmtNum(row[cfg.key])
  };
}

/** 状态列：4 指标状态汇总，非 ok 的以橙色 tag 点名（loss=当日无值 / no_data=全序列无样本） */
function renderStatus(row: Api.Bds.ValuationPercentileRow) {
  const bad = (['pe', 'pb', 'ps', 'dy'] as const)
    .filter(k => row[`status_${k}`] !== 'ok')
    .map(k => `${k.toUpperCase()} ${row[`status_${k}`]}`);
  return bad.length
    ? h('span', { style: 'color: #ef9f27; font-size: 12px' }, bad.join('；'))
    : h('span', { style: 'color: #999; font-size: 12px' }, 'ok');
}

const columns = [
  {
    title: '类型',
    key: 'subject_type',
    width: 55,
    render: (r: Api.Bds.ValuationPercentileRow) => TYPE_LABEL[r.subject_type] || r.subject_type
  },
  { title: '标的', key: 'symbol', width: 115 },
  { title: '观察日', key: 'as_of', width: 90 },
  ...pctFieldConfigs.map(makePctColumn),
  { title: '状态', key: 'status', width: 130, render: renderStatus },
  {
    title: '源末日',
    key: 'source_as_of',
    width: 90,
    render: (r: Api.Bds.ValuationPercentileRow) => r.source_as_of || '-'
  },
  { title: '计算时间', key: 'calc_at', width: 100, render: (r: Api.Bds.ValuationPercentileRow) => fmtCalcAt(r.calc_at) }
];

/** 表格行键：标的 + 观察日唯一 */
function rowKey(r: Api.Bds.ValuationPercentileRow) {
  return `${r.symbol}-${r.as_of}`;
}

async function fetchData() {
  loading.value = true;
  try {
    const [start, end] = searchParams.date_range || [];
    const { data, error } = await fetchValuationPercentiles({
      subject_type: searchParams.subject_type || undefined,
      symbols: searchParams.symbols?.length ? searchParams.symbols : undefined,
      start_date: start || undefined,
      end_date: end || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (error) {
      message.error((error as any)?.message || '估值分位获取失败');
      return;
    }
    tableData.value = data?.items || [];
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
  searchParams.subject_type = null;
  searchParams.symbols = null;
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

onMounted(() => fetchData());
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="类型">
          <NSelect
            v-model:value="searchParams.subject_type"
            clearable
            :options="[
              { label: '指数', value: 'index' },
              { label: '个股', value: 'stock' }
            ]"
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="标的">
          <NSelect
            v-model:value="searchParams.symbols"
            multiple
            clearable
            filterable
            tag
            :options="symbolOptions"
            placeholder="全部（可手输 gm 代码）"
            style="min-width: 280px"
            max-tag-count="responsive"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="观察日">
          <NDatePicker
            v-model:formatted-value="searchParams.date_range"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 250px"
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
          <NButton :loading="loading" @click="fetchData">
            <template #icon><SvgIcon icon="mdi:refresh" /></template>
            刷新
          </NButton>
        </NFormItem>
      </NForm>
      <div class="mt-8px text-12px" style="color: #999">
        本表是
        <b>按日落盘的估值分位</b>
        （一行 = 标的 × 观察日），由「批量同步 → 估值分位落盘」任务生成，与标的监测抽屉的分位同一内核产出。窗口口径：
        <b>有效样本不足 250（约一年交易日）的窗口不保存分位</b>
        ，显示「—」（新股早期窗口 / 股息率当日无值）；「状态」列只描述当日估值值有效性 （loss = 当日无有效值，no_data =
        全序列无样本），与窗口样本量无关。窗口左界为日历对日回溯 3/5/10 年；曲线与实时分位见 IRs →「估值分位专页」。
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
        :scroll-x="1360"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
