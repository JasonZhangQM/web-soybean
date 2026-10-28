<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useMessage } from 'naive-ui';
import {
  createOptionConfig,
  fetchOptionConfigs,
  fetchOptionInfo,
  fetchOptionInfoLatestDate,
  fetchOptionInfoProducts
} from '@/service/api';
import { trimSearchParams } from '@/utils/common';
import { usePageState } from '@/hooks/common/page-state';
import { createTablePagination, setPaginationTotal } from '@/hooks/common/table';

defineOptions({ name: 'OptionInfoPage' });

/**
 * 期权合约（`bds_option_info`）—— openctp 静态合约表本地副本。
 *
 * 回答「合约是什么」：乘数、权威到期日、A 类调整行权价。与「期权行情」页互补：
 * 字典管合约属性，行情页管价格。
 *
 * 菜单挂在「数据」一级（`/bds/option-info`），**不放在「行情数据」组下**：
 * 它是合约属性的权威源、行情只是消费者，层级上不该被当成行情的一种。
 * 排序靠 `routes.ts` 里手补的 `order: 5.5`（紧跟「证券信息」的 5）——用小数是必须的：
 * 生成器按目录字母序排，`option-info` 天然落在 `symbol-infos` 之前，
 * 同 order 只能靠数组顺序，而数组顺序每次 `pnpm build` 都会重排。
 * ⚠️ 这个注释不能写进 `router/elegant/routes.ts`：那是生成文件，build 时整块重写、注释必丢。
 *
 * 三条必须先知道的展示口径：
 *
 * 1. **标准码不是全局唯一**。ETF 沿用交易所「合约简称」口径、不含标的 6 位，
 *    9 个 ETF 标的的行权价区间大量重叠 ⇒ 按代码搜会返回多行（实测 422 组同码）。
 *    这是口径决定的，不是数据错误，所以「标的」列必须和「标准码」并排看。
 * 2. **乘数与行权价必须成对**。A 类是「乘数 10180 + 行权价 7.367 + 名义价 7.500」，
 *    混用（10000 + 7.367）会让市值差 1.8%，所以三列都列出来。
 * 3. **`expire_year_month` 是期权到期月，不是数据源的交割月**。商品期权这两者不同
 *    （DCE `a2701-C-3900` 交割月 202701，期权 2026-12-16 就到期了），字段由
 *    `last_trade_date` 派生，所以两者永远一致。
 *
 * ⚠️ 累积不删：数据源只返回当前挂牌合约，退市的行保留并置 `is_listed=0`。
 * 默认筛选「仅在挂」，要看历史合约得把筛选改成「仅退市」或「全部」。
 */

const message = useMessage();

const loading = ref(false);
const tableData = ref<Api.Bds.OptionInfo[]>([]);
const pagination = createTablePagination();

// 筛选条件（searchParams 必须在 pagination 之前声明，反序会报 TS2448）
const searchParams = reactive<{
  option_name?: string | null;
  exchange?: string | null;
  expire_year_month?: string | null;
  cp?: string | null;
  is_listed?: number | null;
  keyword?: string | null;
}>({
  // 状态留空 = 全部（在挂+退市）；要看当天合约直接选「在挂」
  is_listed: null
});
usePageState({ searchParams, pagination });

const products = ref<Api.Bds.OptionInfoProduct[]>([]);
const latest = ref<Api.Bds.OptionInfoLatestDate>({
  latest_seen_date: null,
  rows: 0,
  listed_rows: 0,
  sync_time: null
});

const productOptions = computed(() =>
  products.value.map(p => ({
    label: p.ctp_underlying ? `${p.option_name}（${p.ctp_underlying}）` : p.option_name,
    value: p.option_name
  }))
);

/**
 * 交易所下拉：值是 openctp `交易所ID` 原值（全大写，后端按大写精确匹配）。
 *
 * 为什么固定写死 8 个而不从接口动态取：字典里 `exchange` 就这 8 个取值
 * （2026-10-27 实测：DCE 7978 / SHFE 5630 / CZCE 5108 / GFEX 4386 /
 * INE 784 / CFFEX 712 / SSE 692 / SZSE 620，合计 25,910），
 * 起一个新交易所的概率远低于多加一次请求的成本。⚠️ 将来真加交易所要同步改这里。
 *
 * 交易所是「品种」的上一级：一个品种只属于一个交易所，所以这个筛选比品种更粗。
 */
const exchangeOptions = [
  { label: '中金所（CFFEX）', value: 'CFFEX' },
  { label: '上期所（SHFE）', value: 'SHFE' },
  { label: '大商所（DCE）', value: 'DCE' },
  { label: '郑商所（CZCE）', value: 'CZCE' },
  { label: '上期能源（INE）', value: 'INE' },
  { label: '广期所（GFEX）', value: 'GFEX' },
  { label: '上交所（SSE）', value: 'SSE' },
  { label: '深交所（SZSE）', value: 'SZSE' }
];

const cpOptions = [
  { label: '认购', value: 'C' },
  { label: '认沽', value: 'P' }
];

const listedOptions = [
  { label: '在挂', value: 1 },
  { label: '退市', value: 0 }
];

/** 行权价：整数不带小数（4000 / 6.25） */
function fmtStrike(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '-';
}

/**
 * 字典行 → 中文品种名（`bds_option_config.option_name` 要的就是它）。
 *
 * 台账只登记了 5 个品种，其余 87 个未登记 ⇒ 返回 null，这类行不能被加入同步清单
 * （后端 `POST /option-config` 会因「未在品种台账登记」直接 400）。
 * ⚠️ ETF 一个品种 ID 覆盖 9 个标的，必须再比 `ctp_underlying`，否则 588000 会被
 * 认成 510500。
 */
function optionNameOf(r: Api.Bds.OptionInfo): string | null {
  const p = products.value.find(
    x => x.product_id === r.product_id && (!x.ctp_underlying || x.ctp_underlying === r.underlying_contract_id)
  );
  return p?.option_name ?? null;
}

/** 勾选行（跨页不保留：翻页即清空，避免「勾了看不见」的误操作） */
const checkedRowKeys = ref<(number | string)[]>([]);

const columns = [
  // 勾选列：只允许「在挂 + 品种已登记」的行——退市合约加进清单没有意义
  {
    type: 'selection' as const,
    width: 45,
    disabled: (r: Api.Bds.OptionInfo) => !r.is_listed || !optionNameOf(r)
  },
  { title: '合约ID', key: 'contract_id', width: 135 },
  {
    title: '标准码',
    key: 'symbol',
    width: 145,
    // ETF 标准码跨标的会重名，所以这一列要能选中复制（span + user-select，§4.11）
    render: (r: Api.Bds.OptionInfo) =>
      r.symbol === r.contract_id
        ? r.symbol
        : h(
            'span',
            { style: 'user-select:text;font-family:monospace', title: 'ETF 标准码（跨标的可能重名，看右侧标的列）' },
            r.symbol
          )
  },
  { title: '合约名称', key: 'contract_name', width: 175 },
  { title: '交易所', key: 'exchange', width: 85 },
  { title: '品种', key: 'product_id', width: 90 },
  { title: '标的', key: 'underlying_contract_id', width: 115 },
  {
    title: '类型',
    key: 'cp',
    width: 70,
    render: (r: Api.Bds.OptionInfo) =>
      h('span', { style: r.cp === 'P' ? 'color:#2f9e6e' : 'color:#d03050' }, r.cp === 'P' ? '认沽' : '认购')
  },
  {
    title: '行权价',
    key: 'strike',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionInfo) => fmtStrike(r.strike)
  },
  {
    title: '名义价',
    key: 'nominal_strike',
    width: 95,
    align: 'right' as const,
    render: (r: Api.Bds.OptionInfo) =>
      h(
        'span',
        { style: 'color:#888', title: '名义行权价 = 行权价 × 乘数 ÷ 品种默认乘数，仅用于拼标准码' },
        fmtStrike(r.nominal_strike)
      )
  },
  {
    title: '乘数',
    key: 'multiplier',
    width: 90,
    align: 'right' as const,
    // A 类乘数是 10180，与品种默认 10000 不同，标红提醒「这行不能按 1 万份算」
    render: (r: Api.Bds.OptionInfo) =>
      r.multiplier !== 10000 && r.exchange !== 'CFFEX' && r.product_id !== 'au_o'
        ? h(
            'span',
            { style: 'color:#d03050;font-weight:600', title: 'A 类调整合约：乘数非品种默认值，须与行权价成对使用' },
            String(r.multiplier)
          )
        : String(r.multiplier)
  },
  {
    title: '最小变动',
    key: 'tick_size',
    width: 92,
    align: 'right' as const,
    render: (r: Api.Bds.OptionInfo) => fmtStrike(r.tick_size)
  },
  { title: '到期日', key: 'last_trade_date', width: 110 },
  { title: '到期月', key: 'expire_year_month', width: 95 },
  { title: '上市日', key: 'list_date', width: 105, render: (r: Api.Bds.OptionInfo) => r.list_date || '-' },
  {
    title: '状态',
    key: 'is_listed',
    width: 85,
    render: (r: Api.Bds.OptionInfo) =>
      h(
        'span',
        { style: r.is_listed ? 'color:#2f9e6e' : 'color:#bbb', title: `最后出现在数据源：${r.last_seen_date}` },
        r.is_listed ? '在挂' : '已退市'
      )
  }
];

/** scroll-x 必须 ≥ 列宽和，否则 naive-ui 会压缩列导致折行（§4.11） */
const scrollX = computed(() => columns.reduce((sum, c) => sum + (c.width || 0), 0));

/** 行键：主键即唯一（symbol 跨标的重名，不能当 key） */
function infoRowKey(r: Api.Bds.OptionInfo) {
  return r.id;
}

// ===================== 查询 =====================

async function fetchData() {
  loading.value = true;
  try {
    const { data, error } = await fetchOptionInfo({
      option_name: searchParams.option_name || undefined,
      exchange: searchParams.exchange || undefined,
      expire_year_month: searchParams.expire_year_month || undefined,
      cp: searchParams.cp || undefined,
      // 留空 = 全部（不传后端就不筛）
      is_listed: searchParams.is_listed ?? undefined,
      keyword: searchParams.keyword || undefined,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize
    });
    if (error) {
      message.error((error as any)?.message || '合约字典获取失败');
      return;
    }
    tableData.value = data?.items || [];
    // 翻页/换筛选即清空勾选：行键只在当前页可解析，留着会「勾了却看不见」
    checkedRowKeys.value = [];
    setPaginationTotal(pagination, data?.total || 0, data?.total_is_estimated);
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  const [p, l] = await Promise.all([fetchOptionInfoProducts(), fetchOptionInfoLatestDate()]);
  if (!p.error && p.data) products.value = p.data;
  if (!l.error && l.data) latest.value = l.data;
}

function handleSearch() {
  trimSearchParams(searchParams);
  pagination.page = 1;
  fetchData();
}

// 模糊输入框：仅清空时立即重搜（输入过程仍由回车触发，避免每敲一个字都请求）
function handleFuzzyInput(value: string | null) {
  if (!value || !value.trim()) handleSearch();
}

function handleReset() {
  searchParams.option_name = null;
  searchParams.exchange = null;
  searchParams.expire_year_month = null;
  searchParams.cp = null;
  searchParams.is_listed = null;
  searchParams.keyword = null;
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

// ===================== 加入同步清单 =====================
//
// 这是「新增合约」的唯一入口：POST /option-config 收 contract_id（全表唯一），
// 不再接受手工拼码 —— 10-26 那次「ETF symbol 多 6 位」事故就是手拼导致的。

const adding = ref(false);
/** 已在清单里的组合，键为 `品种|标准码`（ETF 标准码跨标的重名，必须带品种） */
const existing = ref<Set<string>>(new Set());

async function loadExisting() {
  const { data, error } = await fetchOptionConfigs();
  if (!error && data) existing.value = new Set(data.map(x => `${x.option_name}|${x.symbol}`));
}

const checkedSupported = computed(() =>
  tableData.value.filter(r => checkedRowKeys.value.includes(r.id) && r.is_listed && optionNameOf(r))
);

async function addToConfig() {
  const rows = checkedSupported.value;
  if (!rows.length) {
    message.warning('请先勾选「在挂」且品种已登记的合约（退市或未登记品种不可加入）');
    return;
  }
  const dup = rows.filter(r => existing.value.has(`${optionNameOf(r)}|${r.symbol}`));
  const todo = rows.filter(r => !existing.value.has(`${optionNameOf(r)}|${r.symbol}`));
  if (!todo.length) {
    message.info(`勾选的 ${rows.length} 张都已在清单里`);
    return;
  }
  adding.value = true;
  let ok = 0;
  const fails: string[] = [];
  try {
    // 逐张提交：单张失败不影响其余（后端对「已在清单」与「字典无此合约」都会 400）
    for (const r of todo) {
      const { error } = await createOptionConfig({
        contract_id: r.contract_id,
        option_name: optionNameOf(r) as string
      });
      if (error) {
        fails.push(`${r.symbol}：${(error as any)?.message || '提交失败'}`);
      } else {
        ok += 1;
      }
    }
  } finally {
    adding.value = false;
  }
  const parts = [`已加入 ${ok} 张`];
  if (dup.length) parts.push(`已在清单 ${dup.length} 张`);
  if (fails.length) parts.push(`失败 ${fails.length} 张（${fails.slice(0, 3).join('；')}）`);
  if (fails.length) {
    message.warning(parts.join('，'));
  } else {
    message.success(parts.join('，'));
  }
  checkedRowKeys.value = [];
  loadExisting();
}

// ===================== 字典刷新（已下线） =====================
//
// 2026-10-27 移除页面上的「刷新字典」按钮及其轮询逻辑；随后后端
// `POST /bds/option-info/sync` 与 `syncOptionInfo()` 也一并删除——那是同一段逻辑的第二层包装。
//
// 单刷字典改走批量同步：`startMacroSync({ stages: ['option_info'] })`（后端 `POST /bds/sync/macro`），
// 调的是同一个 `option_info.fetch_and_store()`，任务化 / 全局互斥 / 行数哨兵一样生效。
// 正常情况由「宏观与基础数据同步」卡片按需勾选，本页不参与触发。
//
// 因此本页现在只读 + 「加入同步清单」，`fetchSyncTask` / `syncOptionInfo` 已从 import 移除。

onMounted(() => {
  loadMeta();
  // 拿一份当前清单，用于「已在清单」预筛：勾选里已经有的一眼可辨，不用等后端 400
  loadExisting();
  fetchData();
});
</script>

<template>
  <div class="h-full flex flex-col gap-16px">
    <NCard :bordered="false" class="card-wrapper">
      <NForm label-placement="left" :show-feedback="false" class="flex flex-wrap gap-y-12px">
        <NFormItem label="交易所">
          <NSelect
            v-model:value="searchParams.exchange"
            :options="exchangeOptions"
            clearable
            placeholder="全部交易所"
            style="width: 165px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="品种">
          <NSelect
            v-model:value="searchParams.option_name"
            :options="productOptions"
            clearable
            placeholder="全部品种"
            style="width: 240px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="到期月">
          <NInput
            v-model:value="searchParams.expire_year_month"
            clearable
            placeholder="模糊，如 2612"
            style="width: 130px"
            @keyup.enter="handleSearch"
            @update:value="handleFuzzyInput"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="searchParams.cp"
            :options="cpOptions"
            clearable
            placeholder="全部"
            style="width: 110px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="searchParams.is_listed"
            :options="listedOptions"
            clearable
            placeholder="全部"
            style="width: 115px"
            @update:value="handleSearch"
          />
        </NFormItem>
        <NFormItem label="搜索">
          <NInput
            v-model:value="searchParams.keyword"
            clearable
            placeholder="模糊搜：合约ID / 标准码 / 名称 / 标的 / 交易所"
            style="width: 300px"
            @keyup.enter="handleSearch"
            @update:value="handleFuzzyInput"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>

        <!--
 加入清单：搜索区的**批量按钮**（不针对某一行）。
             字典刷新按钮 10-27 已下线（后端接口也已删），刷新改由批量同步的 option_info 段负责 
-->
        <NFormItem class="ml-auto">
          <NSpace align="center">
            <NButton :disabled="!checkedSupported.length" :loading="adding" @click="addToConfig">
              <template #icon><SvgIcon icon="mdi:playlist-plus" /></template>
              加入同步清单{{ checkedSupported.length ? `（${checkedSupported.length}）` : '' }}
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>

      <div class="mt-8px text-12px" style="color: #999">
        字典更新于
        <b>{{ latest.latest_seen_date || '（尚未拉取）' }}</b>
        <template v-if="latest.sync_time">· 写入 {{ latest.sync_time }}</template>
        · 共
        <b>{{ latest.rows.toLocaleString() }}</b>
        行、在挂
        <b>{{ latest.listed_rows.toLocaleString() }}</b>
        张。
        <b>累积不删</b>
        ：数据源只返回当前挂牌合约，退市的行保留并标为「已退市」，所以要查历史合约请把「状态」改成「全部」。
        <b>标准码跨标的可能重名</b>
        （ETF 沿用交易所简称口径、不含标的 6 位），务必与「标的」列并看。
        <b>乘数与行权价必须成对</b>
        ：A 类是「10180 + 7.367」，按 1 万份算会差 1.8% 市值。
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="tableData"
        :loading="loading"
        remote
        :pagination="pagination"
        :row-key="infoRowKey"
        :scroll-x="scrollX"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>

<style scoped>
/*
 * 单元格一律不换行，宁可整表横向滚动。
 *
 * naive-ui 默认 `white-space: normal`，列宽不足时把「标准码/合约名称」折成两行 ——
 * 16 列的字号本身很小，折行后行高忽高忽低、数字列错位难对。
 * 配 `table-layout: auto` 的效果是：nowrap 让内容撑开列宽（`width` 只是基准值），
 * 总宽超过容器由 `scroll-x` 兜住横向滚动，不会出现截断或省略号。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
