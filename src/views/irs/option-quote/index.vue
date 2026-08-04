<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchOptionMonitors, fetchOptionUnderlyings } from '@/service/api';
import { createTablePagination } from '@/hooks/common/table';

defineOptions({ name: 'IrsOptionQuotePage' });

// T 型报价行结构：同一行权价对应的 call/put 合约及中心轴字段
interface OptionQuoteRow {
  price_strike: number;
  call: Api.Irs.OptionMonitor | null;
  put: Api.Irs.OptionMonitor | null;
  // 中心轴字段（从 call 或 put 取）
  atm_i: number | null;
  price_ud: number | null;
}

const loading = ref(false);
// 原始期权监测数据
const rawData = ref<Api.Irs.OptionMonitor[]>([]);
// T 型报价行数据（按行权价降序）
const tableData = ref<OptionQuoteRow[]>([]);

// 默认参数：标的为沪深300股指期权，到期月为当前月份 1 号时间戳
const buildDefaultEndMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
const searchParams = reactive({
  underlying_symbol: 'SHSE.000300' as string,
  end_month: buildDefaultEndMonth() as number | null
});

// 标的代码下拉选项（从后端 Config 动态拉取）
const underlyingSymbolOptions = ref<{ label: string; value: string }[]>([]);

// 分页配置（复用全局工厂函数）
const pagination = createTablePagination();

// 到期日、剩余天数、标的现价（同一标的+月份下所有合约相同，取首条记录）
const delistedInfo = computed(() => {
  const first = rawData.value[0];
  if (!first) return null;
  return {
    delisted_date: first.delisted_date ? first.delisted_date.slice(0, 10) : '-',
    days_left: first.days_left,
    price_ud: first.price_ud
  };
});

// 数值字段统一保留两位小数，空值显示 '-'
const fmt = (v: number | null | undefined) => (v != null ? Number(v).toFixed(2) : '-');

// 将时间戳格式化为 YYYYMM 字符串
function formatEndMonth(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

// 拉取期权监测列表（一次性拉取全量，前端分页展示）
async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionMonitors({
      underlying_symbol: searchParams.underlying_symbol || undefined,
      end_month: searchParams.end_month ? formatEndMonth(searchParams.end_month) : undefined,
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

function handlePageChange(page: number) {
  pagination.page = page;
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
}

// 拉取下拉选项（标的代码，从 Config.OPTIONS_MARCH 取数）
async function fetchOptions() {
  const { data, error } = await fetchOptionUnderlyings();
  if (!error && data) {
    underlyingSymbolOptions.value = data.underlying_symbols;
  }
}

// 将原始期权监测数据转换为 T 型报价行：按行权价分组，call/put 配对
function transformToQuoteRows(items: Api.Irs.OptionMonitor[]): OptionQuoteRow[] {
  const groupMap = new Map<number, OptionQuoteRow>();
  for (const item of items) {
    let row = groupMap.get(item.price_strike);
    if (!row) {
      row = {
        price_strike: item.price_strike,
        call: null,
        put: null,
        atm_i: null,
        price_ud: null
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
  }
  // 按行权价降序排列
  return Array.from(groupMap.values()).sort((a, b) => b.price_strike - a.price_strike);
}

function handleSearch() {
  fetchData();
}

// 生成认购侧列（取 row.call 的字段）
function makeCallColumn(title: string, field: keyof Api.Irs.OptionMonitor, key: string, width = 90) {
  return {
    title,
    key,
    width,
    render: (row: OptionQuoteRow) => fmt(row.call?.[field])
  };
}

// 生成认沽侧列（取 row.put 的字段）
function makePutColumn(title: string, field: keyof Api.Irs.OptionMonitor, key: string, width = 90) {
  return {
    title,
    key,
    width,
    render: (row: OptionQuoteRow) => fmt(row.put?.[field])
  };
}

// 中心轴列（行权价、平值%、标的现价），加粗突出
function makeAxisColumn(title: string, field: keyof OptionQuoteRow, width = 90) {
  return {
    title,
    key: field as string,
    width,
    className: 'font-bold',
    render: (row: OptionQuoteRow) => fmt(row[field] as number | null)
  };
}

const columns = [
  // 认购侧（7 列，从左到右）
  makeCallColumn('内在(%Y)', 'ratio_i_y', 'call_ratio_i_y'),
  makeCallColumn('内在(%)', 'ratio_i', 'call_ratio_i'),
  makeCallColumn('内在价值', 'value_i', 'call_value_i', 100),
  makeCallColumn('时间(%Y)', 'ratio_t_y', 'call_ratio_t_y'),
  makeCallColumn('时间(%)', 'ratio_t', 'call_ratio_t'),
  makeCallColumn('时间价值', 'value_t', 'call_value_t', 100),
  makeCallColumn('期权现价', 'price', 'call_price', 100),
  // 中心轴（2 列）
  makeAxisColumn('行权价', 'price_strike'),
  makeAxisColumn('平值(%)', 'atm_i'),
  // 认沽侧（7 列，从左到右）
  makePutColumn('期权现价', 'price', 'put_price', 100),
  makePutColumn('时间价值', 'value_t', 'put_value_t', 100),
  makePutColumn('时间(%)', 'ratio_t', 'put_ratio_t'),
  makePutColumn('时间(%Y)', 'ratio_t_y', 'put_ratio_t_y'),
  makePutColumn('内在价值', 'value_i', 'put_value_i', 100),
  makePutColumn('内在(%)', 'ratio_i', 'put_ratio_i'),
  makePutColumn('内在(%Y)', 'ratio_i_y', 'put_ratio_i_y')
];

onMounted(() => {
  fetchOptions();
  fetchData();
});
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="标的">
          <NSelect
            v-model:value="searchParams.underlying_symbol"
            :options="underlyingSymbolOptions"
            filterable
            clearable
            placeholder="请选择"
            style="width: 200px"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NDatePicker
            v-model:value="searchParams.end_month"
            type="month"
            clearable
            placeholder="请选择"
            style="width: 150px"
          />
        </NFormItem>
        <NFormItem>
          <NButton type="primary" @click="handleSearch">搜索</NButton>
        </NFormItem>
        <NFormItem v-if="delistedInfo">
          <span class="text-14px">
            标的现价 {{ fmt(delistedInfo.price_ud) }}　到期日 {{ delistedInfo.delisted_date }}（{{ delistedInfo.days_left }}）
          </span>
        </NFormItem>
      </NForm>
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        :columns="columns"
        :data="pagedData"
        :loading="loading"
        :pagination="pagination"
        remote
        :scroll-x="1700"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
