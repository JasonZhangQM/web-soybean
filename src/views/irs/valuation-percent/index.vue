<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  fetchSymbolInfos,
  fetchIndexValuations,
  fetchIndexValuationPercentiles,
  fetchStockValuations,
  fetchStockValuationPercentiles
} from '@/service/api';
import { dateShortcuts } from '@/utils/date-shortcuts';
import PercentileCards from './modules/PercentileCards.vue';
import ValuationChart from './modules/ValuationChart.vue';
import ValuationTable from './modules/ValuationTable.vue';

defineOptions({ name: 'IrsValuationPercentPage' });

/**
 * 估值分位（IRs 决策区）——指数 / 个股双模式
 *
 * 分工：本页只做**图表与判断**，原始数据表在 `/bds/index-valuation`。
 * 与「中国宏观」同构——`/irs/macro-framework` 是纯图表，`/bds/macro-research/economic-indicators` 是纯表。
 *
 * 指数模式：数据源 `/api/v1/bds/index-*`（5 个宽基整体法估值，成分聚合在 bds 已算好）。
 * 个股模式：数据源 `/api/v1/bds/stock-*`（个股直接查 bds_daily_valuation 自身历史，
 * 后端实时算分位；亏损 PE/负 PB/负 PCF 不参与分位，见接口说明）。
 * 两个模式结构对齐，三块展示（卡片/曲线/明细表）完全复用。
 *
 * ⚠️ 本页**不放写操作**（重算/同步）——那属于数据加工，收口到「批量同步 → 指数估值重算」。
 * 决策区混入写操作，会让「看到的数」和「正在改的数」搅在一起。
 */

type ValuationItem = Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile;

const route = useRoute();
const router = useRouter();
const message = useMessage();

/** 全量指标（指数模式）；个股模式禁用 pe_median（横截面中位数对单标的无意义） */
const METRIC_OPTIONS = [
  { label: 'PE(TTM)', value: 'pe_ttm', stockOk: true },
  { label: 'PB(MRQ)', value: 'pb_mrq', stockOk: true },
  { label: '股息率(%)', value: 'dy_ttm', stockOk: true },
  { label: '中位PE', value: 'pe_median', stockOk: false },
  { label: 'PS(TTM)', value: 'ps_ttm', stockOk: true },
  // PCF 的口径与 PE 不同：只让正经营现金流的成分参与（分子分母同口径剔除），
  // 所以同一标的的 PCF 分位与其他指标代表的样本范围并不相同，故标签里带 * 并在页脚说明
  { label: 'PCF(TTM)*', value: 'pcf_ttm_oper', stockOk: true }
];

/** 个股模式单次最多对比几只（后端上限 10，前端按卡片网格收敛到 5） */
const MAX_STOCKS = 5;

function getDefaultStartDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}

/** URL 初始化：`?mode=stock&symbols=A,B`（指数模式沿用 `?index_codes=A,B`，bds 页跳转兼容） */
function getInitialMode(): 'index' | 'stock' {
  const raw = route.query.mode;
  const str = Array.isArray(raw) ? raw[0] : raw;
  return str === 'stock' ? 'stock' : 'index';
}

function getInitialQueryList(key: string): string[] {
  const raw = route.query[key];
  const str = Array.isArray(raw) ? raw[0] : raw;
  return str ? String(str).split(',').filter(Boolean) : [];
}

const mode = ref<'index' | 'stock'>(getInitialMode());
const metric = ref('pe_ttm');
const startDate = ref<string | null>(getDefaultStartDate());
const visible = ref<string[]>(getInitialQueryList('index_codes')); // 指数勾选；空 = 全部
const stockSymbols = ref<string[]>(getInitialQueryList('symbols').slice(0, MAX_STOCKS));
const loading = ref(false);

const metricOptions = computed(() => (mode.value === 'stock' ? METRIC_OPTIONS.filter(o => o.stockOk) : METRIC_OPTIONS));

const percentiles = ref<Api.Bds.IndexValuationPercentile[]>([]);
const stockPercentiles = ref<Api.Bds.StockValuationPercentile[]>([]);
const seriesData = ref<Api.Bds.IndexValuationSeries | null>(null);
const stockSeries = ref<Api.Bds.StockValuationSeries | null>(null);

const metricLabel = computed(() => METRIC_OPTIONS.find(o => o.value === metric.value)?.label || '');

/** 指数勾选项：从分位接口的**全量**返回里生成（避免前端硬编码指数清单） */
const indexOptions = computed(() =>
  percentiles.value.map(i => ({ label: i.sec_name || i.index_code, value: i.index_code }))
);

/** 当前模式的分位条目（两个类型结构对齐，陈旧提示等公共逻辑直接用） */
const displayItems = computed<ValuationItem[]>(() =>
  mode.value === 'stock' ? stockPercentiles.value : percentiles.value
);

const shownItems = computed<ValuationItem[]>(() => {
  if (mode.value === 'stock') return stockPercentiles.value;
  return visible.value.length ? percentiles.value.filter(i => visible.value.includes(i.index_code)) : percentiles.value;
});

/** 曲线统一喂给 ValuationChart（它与模式无关，只认 dates/series/names/visible） */
const chartProps = computed(() => {
  if (mode.value === 'stock' && stockSeries.value) {
    return {
      dates: stockSeries.value.trade_dates,
      series: stockSeries.value.series,
      names: stockSeries.value.sec_names,
      visible: stockSymbols.value
    };
  }
  if (mode.value === 'index' && seriesData.value) {
    return {
      dates: seriesData.value.trade_dates,
      series: seriesData.value.series,
      names: seriesData.value.sec_names,
      visible: visible.value
    };
  }
  return null;
});

/**
 * 全页陈旧提示：只要有一个标的落后于个股估值源末日就提示。
 * 卡片底部虽已标「截至 X」，但小字容易被忽略 —— 陈旧时"当前值"不是最新值，
 * 直接拿它判贵贱会出错，必须在筛选条下方就说清。
 */
const staleInfo = computed(() => {
  const stale = displayItems.value.filter(i => i.is_stale);
  if (!stale.length) return null;
  const asOf = stale
    .map(i => i.as_of)
    .filter((d): d is string => !!d)
    .sort()[0];
  return {
    asOf,
    days: Math.max(...stale.map(i => i.stale_days || 0)),
    names: stale.map(i => i.sec_name || ('index_code' in i ? i.index_code : i.symbol)).join('、')
  };
});

/** 个股模式未选标的：与「表为空」区分开，是引导不是报错 */
const stockEmpty = computed(() => mode.value === 'stock' && stockSymbols.value.length === 0);

/** 全无数据：表刚建/刚清空时卡片都是空的，得说清"不是坏了，是还没算" */
const hasNoData = computed(() => {
  if (mode.value === 'stock') return false; // 未选标的走 stockEmpty 引导
  return percentiles.value.length > 0 && percentiles.value.every(i => i.current == null);
});

// ---------------------------------------------------------------------------
// 个股远程搜索（复用 /bds/symbol-infos：keyword 对代码/名称/拼音缩写模糊匹配）
// ---------------------------------------------------------------------------

const stockOptions = ref<{ label: string; value: string }[]>([]);
const stockSearching = ref(false);

async function handleStockSearch(query: string) {
  if (!query || !query.trim()) {
    stockOptions.value = [];
    return;
  }
  stockSearching.value = true;
  try {
    const res = await fetchSymbolInfos({
      keyword: query.trim(),
      only_stock: true,
      trading_status: 'trading',
      limit: 20
    });
    if (!res.error) {
      stockOptions.value = (res.data?.items || []).map(s => ({
        label: `${s.symbol} ${s.name}${s.board ? `（${s.board}）` : ''}`,
        value: s.symbol
      }));
    }
  } finally {
    stockSearching.value = false;
  }
}

/** 已选标的也要在选项池里占位，否则 NSelect 回显会显示成裸代码 */
function stockSelectOptions() {
  const selected = stockPercentiles.value
    .filter(i => !stockOptions.value.some(o => o.value === i.symbol))
    .map(i => ({ label: `${i.symbol} ${i.sec_name || ''}`, value: i.symbol }));
  return [...selected, ...stockOptions.value];
}

// ---------------------------------------------------------------------------

async function fetchData() {
  loading.value = true;
  try {
    if (mode.value === 'index') {
      const [pctRes, seriesRes] = await Promise.all([
        // 分位**不传** index_codes：这里要的是全景（同时作为下拉选项池），
        // 若按筛选传，取消勾选后选项池会跟着缩小、再也选不回来
        fetchIndexValuationPercentiles({ metric: metric.value }),
        // 曲线**传** index_codes：服务端筛选，少画几条线也少传几列
        fetchIndexValuations({
          start_date: startDate.value || undefined,
          metric: metric.value,
          index_codes: visible.value.length ? visible.value : undefined
        })
      ]);
      if (pctRes.error) {
        message.error((pctRes.error as any)?.message || '分位数据获取失败');
      } else {
        percentiles.value = pctRes.data?.items || [];
      }
      if (seriesRes.error) {
        message.error((seriesRes.error as any)?.message || '估值序列获取失败');
      } else {
        seriesData.value = seriesRes.data || null;
      }
    } else {
      if (!stockSymbols.value.length) {
        stockPercentiles.value = [];
        stockSeries.value = null;
        return;
      }
      const [pctRes, seriesRes] = await Promise.all([
        fetchStockValuationPercentiles({ symbols: stockSymbols.value, metric: metric.value }),
        fetchStockValuations({
          symbols: stockSymbols.value,
          metric: metric.value,
          start_date: startDate.value || undefined
        })
      ]);
      if (pctRes.error) {
        message.error((pctRes.error as any)?.message || '个股分位获取失败');
      } else {
        stockPercentiles.value = pctRes.data?.items || [];
      }
      if (seriesRes.error) {
        message.error((seriesRes.error as any)?.message || '个股估值序列获取失败');
      } else {
        stockSeries.value = seriesRes.data || null;
      }
    }
  } finally {
    loading.value = false;
  }
}

/** 指标切换：指标变了，分位与曲线都得重算 */
function handleMetricChange() {
  fetchData();
}

/** 模式切换：个股模式不认 pe_median，必要时回落到 PE */
function handleModeChange(m: 'index' | 'stock') {
  mode.value = m;
  if (m === 'stock' && metric.value === 'pe_median') {
    metric.value = 'pe_ttm';
  }
  fetchData();
}

/** 跳回 bds 原始数据页（该页自己有 page-state 记忆，会保留上次筛选） */
function goRawData() {
  router.push({ name: 'bds_index-valuation' });
}

onMounted(fetchData);
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="标的">
          <NRadioGroup :value="mode" size="small" @update:value="handleModeChange">
            <NRadioButton value="index" label="指数" />
            <NRadioButton value="stock" label="个股" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="指标">
          <NRadioGroup v-model:value="metric" size="small" @update:value="handleMetricChange">
            <NRadioButton v-for="o in metricOptions" :key="o.value" :value="o.value" :label="o.label" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="起始日期">
          <NDatePicker
            v-model:formatted-value="startDate"
            type="date"
            value-format="yyyy-MM-dd"
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
            @update:formatted-value="fetchData"
          />
        </NFormItem>
        <NFormItem v-if="mode === 'index'" label="指数">
          <NSelect
            v-model:value="visible"
            multiple
            clearable
            filterable
            :options="indexOptions"
            placeholder="全部"
            style="min-width: 260px"
            max-tag-count="responsive"
            @update:value="fetchData"
          />
        </NFormItem>
        <NFormItem v-else label="个股">
          <NSelect
            v-model:value="stockSymbols"
            multiple
            clearable
            filterable
            remote
            :max-tag-count="3"
            :options="stockSelectOptions()"
            :loading="stockSearching"
            :max="MAX_STOCKS"
            placeholder="输入代码 / 名称 / 拼音搜索（最多 5 只）"
            style="min-width: 300px"
            @search="handleStockSearch"
            @update:value="fetchData"
          />
        </NFormItem>
        <NFormItem class="ml-auto">
          <NSpace>
            <NButton :loading="loading" @click="fetchData">
              <template #icon><SvgIcon icon="mdi:refresh" /></template>
              刷新
            </NButton>
            <NButton type="info" @click="goRawData">
              <template #icon><SvgIcon icon="mdi:table" /></template>
              原始数据
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>

      <div class="mt-8px text-12px" style="color: #999">
        <template v-if="mode === 'index'">
          分位与中位数由后端实时计算（窗口按日历对日回溯 3/5/10 年，如观察日 2025-10-23 的 10 年窗口左界为
          2015-10-23；锚点为各指数最后一个有值交易日），前端只做染色。 数据来源于 BDs
          →「指数估值」，本页不含任何写操作（重算在「批量同步 → 指数估值重算」）。
        </template>
        <template v-else>
          个股分位由后端对该标的自身历史（BDs 每日估值）实时计算，窗口口径与指数一致； 亏损期负 PE、净资产为负的负
          PB、现金流为负的负 PCF 不参与分位（避免"亏损当便宜"）。 本页不含任何写操作。
        </template>
      </div>
      <div v-if="metric === 'pcf_ttm_oper'" class="mt-6px text-12px" style="color: #ef9f27">
        <b>* PCF 口径与 PE 不同</b>
        ：只让正经营现金流的{{ mode === 'stock' ? '时段' : '成分' }}参与，分子分母同口径剔除（PE 则把亏损计入分母）。 故
        PCF 分位的样本范围比其他指标小；负现金流占比越高，可比性越弱。
      </div>
      <NAlert v-if="staleInfo" type="warning" :bordered="false" class="mt-10px" :show-icon="true">
        估值数据截至 {{ staleInfo.asOf }}，落后最新个股数据 {{ staleInfo.days }} 天（{{ staleInfo.names }}） ——
        卡片上的「当前值」不是最新值，判断分位前需先等估值同步。
      </NAlert>
      <NAlert v-else-if="stockEmpty" type="info" :bordered="false" class="mt-10px" :show-icon="true">
        个股模式：请在上方搜索并选择个股（最多 5 只对比），再看分位。
      </NAlert>
      <NAlert v-else-if="hasNoData" type="info" :bordered="false" class="mt-10px" :show-icon="true">
        尚无估值数据（表为空）：需先到 BDs →「指数估值」执行重算/回填，本页才有分位可看。
      </NAlert>
    </NCard>

    <NCard :bordered="false" class="card-wrapper mb-16px" size="small" title="估值分位">
      <template #header-extra>
        <span class="text-12px op-60">
          默认看 10 年分位；&gt;80% 红（贵），&lt;20% 绿（便宜）
          <template v-if="metric === 'dy_ttm'">；股息率为反向指标，染色已按便宜度反转（数字仍为原始分位）</template>
        </span>
      </template>
      <PercentileCards :items="shownItems" :metric-label="metricLabel" :metric="metric" :mode="mode" />
    </NCard>

    <NCard :bordered="false" class="card-wrapper mb-16px" size="small" :title="`${metricLabel} 估值曲线`">
      <ValuationChart
        v-if="chartProps"
        :dates="chartProps.dates"
        :series="chartProps.series"
        :names="chartProps.names"
        :visible="chartProps.visible"
        :metric-label="metricLabel"
      />
      <NEmpty v-else description="暂无数据" class="py-24px" />
    </NCard>

    <NCard :bordered="false" class="card-wrapper" size="small" title="分位明细">
      <ValuationTable :items="shownItems" :metric-label="metricLabel" :metric="metric" :mode="mode" />
    </NCard>
  </div>
</template>
