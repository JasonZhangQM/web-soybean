<script setup lang="ts">
/**
 * 标的监测抽屉「财务分析」Tab（2026-11-17，方案 v8）
 *
 * 懒加载：切到本 Tab 才 mount，一次拉 `GET /irs/um-finance-stats`。
 * 前端零口径计算——单季差分、TTM、净现比、扣非占比、覆盖率全部后端算好，
 * 这里只做染色、格式化（元→亿）和画图（与估值与走势 Tab 的约定一致）。
 *
 * 双口径（v8，2026-11-26 窗口扩为 10 年）：freq=latest 近 10 年报告期（默认，含单季差分）/
 * freq=annual 近 N 年年报。
 * 「归母净利润」卡为东财式设计（2026-11-26 修订）：柱按年并列 Q1-Q4(FY) 四色
 * （C1-C4 蓝/青/绿/橙，与其他图表主色一致）；四条同比线与柱一一对应、颜色相同
 * （单季度=单季同比 / 报告期=累计同比），每根柱悬停显示「年份+报告期：值（同比%）」。
 *
 * 个股与指数零分流：统一 symbol 查询；指数行多出覆盖率徽标与口径注释。
 * 外盘标的（SPX / GC00Y）无财务数据走空态卡，不猜数。
 *
 * 局限声明（固定文案，写死不配置）：指数行由成分股三表聚合整体法派生，
 * roe_weight / ebitda_toi 恒空；银行不适用毛利率 / 流动比率（招商银行实测为空）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { fetchUmFinanceStats, syncUmFinance } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import FinanceChartCard from './FinanceChartCard.vue';

defineOptions({ name: 'UnderlyingFinanceTab' });

const props = defineProps<{ symbol: string }>();

const YEARS_OPTIONS = [
  { label: '近 3 年年报', value: 3 },
  { label: '近 5 年年报', value: 5 },
  { label: '近 10 年年报', value: 10 }
];

/** 口径选项（方案 v8，2026-11-26 报告期窗口改为 10 年）：报告期=近 10 年含单季差分（默认）/ 年报=近 N 年 */
const FREQ_OPTIONS = [
  { label: '报告期(10年)', value: 'latest' },
  { label: '年报', value: 'annual' }
];

/** 默认报告期口径（2026-11-17 用户拍板），years 仅年报口径生效 */
const freq = ref<'annual' | 'latest'>('latest');
const years = ref(5);
/** 东财式归母净利润卡的展示模式：报告期=累计柱+同比线 / 单季度=按年分组四色柱 */
const profitMode = ref<'report' | 'quarter'>('report');

const stats = ref<Api.Irs.UmFinanceStats | null>(null);
const loading = ref(false);
const loadError = ref(false);
const syncLoading = ref(false);
/** 请求序号：快速切区间时只认最后一次响应，防旧数据覆盖新数据 */
let seq = 0;

async function load() {
  const cur = ++seq;
  loading.value = true;
  loadError.value = false;
  const { data, error } = await fetchUmFinanceStats({
    symbol: props.symbol,
    years: years.value,
    freq: freq.value
  });
  if (cur !== seq) return;
  loading.value = false;
  if (error || !data) {
    loadError.value = true;
    stats.value = null;
    return;
  }
  stats.value = data;
}

onMounted(load);
watch(() => [props.symbol, years.value, freq.value], load);
// 年报口径无单季数据，切回时重置东财卡的展示模式
watch(freq, f => {
  if (f === 'annual') profitMode.value = 'report';
});

async function handleSync() {
  await executeSync(() => syncUmFinance(props.symbol), syncLoading, load);
}

// ---------- 渲染辅助（格式化，非口径计算） ----------

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);
}

/** 元 → 亿（展示单位换算，非口径计算） */
function toYi(v: number | null | undefined): number | null {
  return v == null ? null : Number(v) / 1e8;
}

const isEmpty = computed(() => stats.value?.coverage.empty ?? false);
const isIndex = computed(() => stats.value?.subject_type === 'index');

/** 指数覆盖率徽标：≥95% 绿 / ≥85% 黄 / <85% 红；tooltip 展示 聚合n/快照N */
const coverageTag = computed(() => {
  if (!isIndex.value) return null;
  const pct = stats.value?.coverage.coverage_pct;
  if (pct == null) return { type: 'default' as const, text: '覆盖率 —' };
  const type = (pct >= 95 ? 'success' : pct >= 85 ? 'warning' : 'error') as 'success' | 'warning' | 'error';
  return { type, text: `成分覆盖 ${pct.toFixed(1)}%` };
});

/** x 轴标签：后端算好的报告期标签（2025FY / 2026Q1），缺 tag 回落 ISO 日期 */
const xLabels = computed(() => (stats.value?.series ?? []).map(p => p.rpt_label ?? p.rpt_date));

/** 按字段名从序列取数组（缺值补 null 断线） */
function seriesData(key: keyof Api.Irs.UmFinancePeriod): (number | null)[] {
  return (stats.value?.series ?? []).map(a => (a[key] == null ? null : Number(a[key])));
}

/** 绝对值字段 → 亿（元→亿换算后取数组） */
function seriesDataYi(key: 'net_prof' | 'net_prof_cut' | 'revenue' | 'ocf'): (number | null)[] {
  return (stats.value?.series ?? []).map(a => toYi(a[key]));
}

// 系列取色（与 ValuationTrendChart 同一套主色习惯）
const C1 = '#5da8ff';
const C2 = '#26deca';
const C3 = '#3b9a4b';
const C4 = '#ef9f27';
const C5 = '#e24b4a';
const C6 = '#9857d3';

const profitSeries = computed(() => [
  { name: 'ROE(摊薄)', color: C1, type: 'line' as const, data: seriesData('roe') },
  { name: 'ROE(平均)', color: C2, type: 'line' as const, data: seriesData('roe_avg') },
  { name: 'ROIC', color: C3, type: 'line' as const, data: seriesData('roic') },
  { name: 'ROA', color: C4, type: 'line' as const, data: seriesData('roa') },
  { name: '毛利率', color: C5, type: 'line' as const, data: seriesData('sale_gpm') },
  { name: '净利率', color: C6, type: 'line' as const, data: seriesData('sale_npm') }
]);

const growthSeries = computed(() => [
  { name: '归母净利润 YoY', color: C1, type: 'bar' as const, data: seriesData('net_prof_pcom_yoy') },
  { name: '营业总收入 YoY', color: C2, type: 'bar' as const, data: seriesData('ttl_inc_oper_yoy') },
  { name: '总资产 YoY', color: C4, type: 'line' as const, data: seriesData('ttl_asset_yoy') }
]);

const profitCompareSeries = computed(() => [
  { name: '归母净利润(亿)', color: C1, type: 'bar' as const, data: seriesDataYi('net_prof') },
  { name: '扣非归母(亿)', color: C3, type: 'bar' as const, data: seriesDataYi('net_prof_cut') },
  { name: '扣非占比(%)', color: C4, type: 'line' as const, data: seriesData('cut_ratio'), axisIndex: 1 }
]);

// ---------- 东财式「归母净利润」卡（方案 v8，借鉴东方财富净利润分析） ----------

/** Q1-Q4(FY) 四色：取本 Tab 通用系列色 C1-C4（蓝/青/绿/橙），与其他图表主色习惯一致（同比线与柱同色） */
const PROFIT_Q_COLORS = [C1, C2, C3, C4];
/** 柱系列名：单季度=Q1-Q4 单季值 / 报告期=各期累计值，两组共用同一套四色与 tag 顺序 */
const PROFIT_Q_NAMES = ['一季度', '二季度', '三季度', '四季度'];
const PROFIT_RPT_NAMES = ['一季报', '中报', '三季报', '年报'];
/** 报告期 tag：i=3 为年报 FY，其余 Q1-Q3（后端 q_tag 约定） */
const PROFIT_TAGS = ['Q1', 'Q2', 'Q3', 'FY'];

/** 当期模式的柱系列名（柱与同比线一一对应，颜色相同） */
const profitPeriodNames = computed(() => (profitMode.value === 'quarter' ? PROFIT_Q_NAMES : PROFIT_RPT_NAMES));

/** 当期模式的取数字段：柱=单季值/累计值，同比线=单季同比/累计同比 */
function profitKeys() {
  return profitMode.value === 'quarter'
    ? { valueKey: 'sq_net_prof' as const, yoyKey: 'sq_net_prof_yoy' as const }
    : { valueKey: 'net_prof' as const, yoyKey: 'net_prof_pcom_yoy' as const };
}

/** 按年分组：一年的四根柱并列（q_tag + 年份定位序列行） */
const profitTrendDates = computed(() => {
  const list = stats.value?.series ?? [];
  return [...new Set(list.map(p => (p.rpt_label ?? p.rpt_date).slice(0, 4)))];
});

const profitTrendSeries = computed(() => {
  const list = stats.value?.series ?? [];
  const yearLabels = [...new Set(list.map(p => (p.rpt_label ?? p.rpt_date).slice(0, 4)))];
  const { valueKey, yoyKey } = profitKeys();
  const rowOf = (tag: string, y: string) =>
    list.find(x => (x.q_tag ?? '') === tag && (x.rpt_label ?? '').startsWith(y));
  // 四个柱系列：按年并列，Q1-Q4(FY) 四色
  const barSeries = profitPeriodNames.value.map((name, i) => ({
    name,
    color: PROFIT_Q_COLORS[i],
    type: 'bar' as const,
    data: yearLabels.map(y => {
      const p = rowOf(PROFIT_TAGS[i], y);
      return p ? toYi(p[valueKey]) : null;
    })
  }));
  // 四条同比线：与柱一一对应、颜色一致（每条线每年一个点，右轴 %）
  const yoySeries = profitPeriodNames.value.map((name, i) => ({
    name: `${name}同比`,
    color: PROFIT_Q_COLORS[i],
    type: 'line' as const,
    data: yearLabels.map(y => {
      const p = rowOf(PROFIT_TAGS[i], y);
      return p ? (p[yoyKey] ?? null) : null;
    }),
    axisIndex: 1 as const
  }));
  return [...barSeries, ...yoySeries];
});

/** tooltip 行格式：柱值后直接跟该柱同比 → 「2026年一季报：12707.81（35.21%）」；
 * 空值行与四条同比线行（括号内已有，避免重复）返回 null 隐藏 */
function profitTipLine(axisLabel: string, seriesName: string, value: number | null) {
  if (value == null || seriesName.endsWith('同比')) return null;
  const { yoyKey } = profitKeys();
  const idx = profitPeriodNames.value.indexOf(seriesName);
  const tag = idx >= 0 ? PROFIT_TAGS[idx] : '';
  const p = (stats.value?.series ?? []).find(x => (x.q_tag ?? '') === tag && (x.rpt_label ?? '').startsWith(axisLabel));
  const yoy = p ? p[yoyKey] : null;
  return `${axisLabel}年${seriesName}：${value.toFixed(2)}（${yoy == null ? '—' : `${yoy.toFixed(2)}%`}）`;
}

const cashflowSeries = computed(() => [
  { name: '净现比(倍)', color: C2, type: 'line' as const, data: seriesData('net_cash_ratio') },
  { name: '经营现金流(亿)', color: C1, type: 'bar' as const, data: seriesDataYi('ocf'), axisIndex: 1 }
]);

const solvencySeries = computed(() => [
  { name: '资产负债率(%)', color: C1, type: 'line' as const, data: seriesData('ast_liab_rate') },
  { name: '流动比率(倍)', color: C3, type: 'line' as const, data: seriesData('curr_rate'), axisIndex: 1 },
  { name: '速动比率(倍)', color: C4, type: 'line' as const, data: seriesData('quick_rate'), axisIndex: 1 }
]);

const operationSeries = computed(() => [
  { name: '总资产周转率(%)', color: C1, type: 'line' as const, data: seriesData('ttl_ast_turnover_rate') },
  {
    name: '应收周转天数(天)',
    color: C3,
    type: 'line' as const,
    data: seriesData('acct_rcv_turnover_days'),
    axisIndex: 1
  },
  { name: '存货周转天数(天)', color: C4, type: 'line' as const, data: seriesData('inv_turnover_days'), axisIndex: 1 }
]);

/** 快照卡两行描述：当期累计 vs TTM（亿） */
const snapshotRows = computed(() => {
  const l = stats.value?.latest;
  if (!l) return [];
  return [
    { label: '归母净利润(亿)', cur: toYi(l.net_prof), ttm: toYi(l.ttm_net_prof) },
    { label: '扣非归母(亿)', cur: toYi(l.net_prof_cut), ttm: toYi(l.ttm_net_prof_cut) },
    { label: '营业总收入(亿)', cur: toYi(l.revenue), ttm: toYi(l.ttm_revenue) },
    { label: '经营现金流(亿)', cur: toYi(l.ocf), ttm: toYi(l.ttm_ocf) }
  ];
});

/** 快照卡比率区：与年报序列同口径，方便逐项对照 */
const snapshotRatios = computed(() => {
  const l = stats.value?.latest;
  if (!l) return [];
  return [
    { label: 'ROE(摊薄)', value: l.roe, unit: '%' },
    { label: 'ROE(平均)', value: l.roe_avg, unit: '%' },
    { label: 'ROIC', value: l.roic, unit: '%' },
    { label: 'ROA', value: l.roa, unit: '%' },
    { label: '毛利率', value: l.sale_gpm, unit: '%' },
    { label: '净利率', value: l.sale_npm, unit: '%' },
    { label: '归母 YoY', value: l.net_prof_pcom_yoy, unit: '%' },
    { label: '营收 YoY', value: l.ttl_inc_oper_yoy, unit: '%' },
    { label: '净现比', value: l.net_cash_ratio, unit: '倍' },
    { label: '扣非占比', value: l.cut_ratio, unit: '%' },
    { label: '资产负债率', value: l.ast_liab_rate, unit: '%' },
    { label: '流动比率', value: l.curr_rate, unit: '倍' },
    { label: '速动比率', value: l.quick_rate, unit: '倍' },
    { label: '总资产周转率', value: l.ttl_ast_turnover_rate, unit: '%' }
  ];
});
</script>

<template>
  <div class="flex flex-col gap-16px pb-16px">
    <!-- 控件：口径 / 区间 / 同步 / 主体类型 / 覆盖率 -->
    <div class="flex flex-wrap items-center gap-12px">
      <NSelect v-model:value="freq" :options="FREQ_OPTIONS" class="w-130px" />
      <NSelect v-if="freq === 'annual'" v-model:value="years" :options="YEARS_OPTIONS" class="w-130px" />
      <span v-else class="text-12px op-60">近 10 年报告期 · 含单季度</span>
      <NButton size="small" :loading="syncLoading" @click="handleSync">同步财务数据</NButton>
      <NTag size="small" :bordered="false" :type="isIndex ? 'info' : 'default'">
        {{ isIndex ? '指数成分聚合（整体法）' : '个股财报（gm 口径）' }}
      </NTag>
      <NTooltip v-if="coverageTag" trigger="hover">
        <template #trigger>
          <NTag size="small" :bordered="false" :type="coverageTag.type">{{ coverageTag.text }}</NTag>
        </template>
        聚合 {{ stats?.coverage.agg_cons_cnt ?? '—' }} / 快照 {{ stats?.coverage.snap_cons_cnt ?? '—' }} 只成分股
      </NTooltip>
      <span v-if="stats?.coverage.data_start" class="text-12px op-60">
        序列 {{ freq === 'annual' ? '年报' : '报告期' }} {{ stats.coverage.data_start }} ~
        {{ stats.coverage.latest_rpt_date ?? '—' }}
      </span>
    </div>

    <NSpin :show="loading">
      <NAlert v-if="loadError" title="财务分析数据加载失败">重试或检查后端同步任务状态。</NAlert>

      <template v-else-if="stats">
        <!-- 空态：外盘 / 商品类标的 -->
        <div v-if="isEmpty" class="rounded-8px p-32px text-center" style="border: 1px dashed rgba(128, 128, 128, 0.35)">
          <div class="text-14px font-500 op-70">该标的无财务数据</div>
          <div class="mt-8px text-12px op-50">{{ stats.coverage.empty_reason }}</div>
          <div class="mt-8px text-12px op-50">
            财务分析仅覆盖 A 股个股与 A 股指数（成分股聚合）；外盘 / 商品类标的走估值与走势 Tab。
          </div>
        </div>

        <template v-else>
          <NAlert v-if="stats.message" type="warning" class="mb-12px">{{ stats.message }}</NAlert>

          <!-- 最新报告期快照卡（含 TTM） -->
          <section v-if="stats.latest" class="mb-16px">
            <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
              <div class="mb-8px flex items-center justify-between">
                <span class="text-14px font-500">最新报告期快照 · {{ stats.latest.rpt_date }}</span>
                <span class="text-12px op-60">
                  披露日 {{ stats.latest.pub_date ?? '—' }} · TTM=最新累计−去年同期+上年年报
                </span>
              </div>
              <NDescriptions :column="4" size="small" bordered>
                <NDescriptionsItem v-for="row in snapshotRows" :key="row.label" :label="row.label">
                  当期 {{ fmt(row.cur) }} · TTM {{ fmt(row.ttm) }}
                </NDescriptionsItem>
              </NDescriptions>
              <div class="mt-8px flex flex-wrap gap-x-16px gap-y-4px">
                <span v-for="r in snapshotRatios" :key="r.label" class="text-12px">
                  <span class="op-60">{{ r.label }}</span>
                  <span class="font-500">{{ fmt(r.value) }}{{ r.unit }}</span>
                </span>
              </div>
            </div>
          </section>

          <!-- 东财式归母净利润：柱按年并列 Q1-Q4(FY) 四色；四条同比线与柱一一对应同色；tooltip 柱值后直接跟该柱同比 -->
          <FinanceChartCard
            title="归母净利润"
            :tip="
              profitMode === 'quarter'
                ? '柱=单季净利润（亿元）=本期累计−上季累计（Q1 即一季报累计），线=各季度单季同比（%，颜色与柱对应）'
                : '柱=各报告期累计归母净利润（亿元），线=各报告期累计同比（%，颜色与柱对应）'
            "
            :dates="profitTrendDates"
            :series="profitTrendSeries"
            :y-axes="['亿元', '%']"
            :tip-line-formatter="profitTipLine"
          >
            <template #actions>
              <NRadioGroup v-if="freq === 'latest'" v-model:value="profitMode" size="small">
                <NRadioButton value="quarter">单季度</NRadioButton>
                <NRadioButton value="report">报告期</NRadioButton>
              </NRadioGroup>
            </template>
          </FinanceChartCard>

          <!-- 盈利能力 -->
          <FinanceChartCard
            title="盈利能力"
            tip="ROE / ROIC / ROA / 毛利率 / 净利率（%）"
            :dates="xLabels"
            :series="profitSeries"
            :y-axes="['%']"
          />

          <!-- 成长性 -->
          <FinanceChartCard
            title="成长性"
            tip="归母净利润 / 营业总收入 / 总资产 同比（%）"
            :dates="xLabels"
            :series="growthSeries"
            :y-axes="['%']"
          />

          <!-- 归母 vs 扣非 -->
          <FinanceChartCard
            title="归母净利润 vs 扣非归母"
            tip="柱=绝对值（亿元），线=扣非占比（%）"
            :dates="xLabels"
            :series="profitCompareSeries"
            :y-axes="['亿元', '%']"
            :note="
              isIndex ? '指数行扣非 = 成分股扣非加总（整体法），与个股扣非定义存在口径差异，仅供趋势判读。' : undefined
            "
          />

          <!-- 现金流质量 -->
          <FinanceChartCard
            title="现金流质量"
            tip="净现比（倍）= 经营现金流净额 ÷ 归母净利润"
            :dates="xLabels"
            :series="cashflowSeries"
            :y-axes="['倍', '亿元']"
            :note="isIndex ? '银行经营现金流占比高会抬高净现比（沪深300 实测 3.7），指数行判读以趋势为主。' : undefined"
          />

          <!-- 偿债与营运 -->
          <FinanceChartCard
            title="偿债能力"
            tip="资产负债率（%）· 流动 / 速动比率（倍）"
            :dates="xLabels"
            :series="solvencySeries"
            :y-axes="['%', '倍']"
            :note="isIndex ? '银行不适用毛利率与流动 / 速动比率（如招商银行实测为空），对应系列显示 —。' : undefined"
          />
          <FinanceChartCard
            title="营运能力"
            tip="总资产周转率（%）· 应收 / 存货周转天数（天）"
            :dates="xLabels"
            :series="operationSeries"
            :y-axes="['%', '天']"
          />

          <!-- 局限声明（固定文案） -->
          <div class="text-12px op-50">
            局限声明：指数行财务指标由成分股三大报表聚合整体法派生（比率 ×100 存百分比），ROE 加权口径与 EBITDA
            指标恒为空；平均类与周转类指标在指数首年起始年份缺上年参考行、显示 —；个股数据来自 聚源 gm
            口径。以上不构成投资建议。
          </div>
        </template>
      </template>
    </NSpin>
  </div>
</template>
