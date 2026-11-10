<script setup lang="ts">
/**
 * 标的监测抽屉「估值与走势」Tab（2026-11-08）
 *
 * 懒加载：切到本 Tab 才 mount，一次拉 `GET /irs/um-market-stats` 的四块数据。
 * 前端零口径计算——分位、估值序列、累计收益率、回撤、降级百分比全部后端算好，
 * 这里只做染色、格式化和画图（与概览 Tab 的约定一致）。
 *
 * 无数据标的（GC00Y / SPX 无估值与日频行情）走主表行情字段降级，
 * 明确写成「非累计收益率、非回撤」，不用实时价凑数。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { fetchUmMarketStats } from '@/service/api';
import ValuationChart from '@/views/irs/valuation-percent/modules/ValuationChart.vue';
import PerformanceChart from './PerformanceChart.vue';
import SectionBar from './SectionBar.vue';

defineOptions({ name: 'UnderlyingMarketStatsTab' });

const props = defineProps<{ symbol: string }>();

const RANGE_OPTIONS = [
  { label: '近 1 年', value: '1y' },
  { label: '近 3 年', value: '3y' },
  { label: '近 5 年', value: '5y' },
  { label: '近 10 年', value: '10y' },
  { label: '年初至今', value: 'ytd' },
  { label: '全史', value: 'all' }
];
const METRIC_OPTIONS = [
  { label: 'PE(TTM)', value: 'pe_ttm' },
  { label: 'PB(MRQ)', value: 'pb_mrq' },
  { label: 'PS(TTM)', value: 'ps_ttm' },
  { label: '股息率(%)', value: 'dy_ttm' }
];
const METRIC_KEYS = ['pe_ttm', 'pb_mrq', 'ps_ttm', 'dy_ttm'] as const;
const METRIC_NAMES: Record<string, string> = {
  pe_ttm: 'PE(TTM)',
  pb_mrq: 'PB(MRQ)',
  ps_ttm: 'PS(TTM)',
  dy_ttm: '股息率(%)'
};

/** 默认区间近 10 年、默认指标 PE(TTM)（2026-11-09 用户改拍板，原 5y） */
const range = ref('10y');
const metric = ref('pe_ttm');
const stats = ref<Api.Irs.UmMarketStats | null>(null);
const loading = ref(false);
const loadError = ref(false);
/** 请求序号：快速切区间时只认最后一次响应，防旧数据覆盖新数据 */
let seq = 0;

async function load() {
  const cur = ++seq;
  loading.value = true;
  loadError.value = false;
  const { data, error } = await fetchUmMarketStats({
    symbol: props.symbol,
    range: range.value,
    metric: metric.value
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
watch(() => [props.symbol, range.value, metric.value], load);

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);
}

function fmtPct(v: number | null | undefined, sign = false): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** A 股习惯：涨红跌绿；回撤恒 ≤0 走绿 */
function trendColor(v: number | null | undefined): string {
  if (v == null) return 'inherit';
  if (v > 0) return '#e24b4a';
  if (v < 0) return '#3b9a4b';
  return 'inherit';
}

/** 分位配色：高分位=贵=红，低分位=便宜=绿；股息率反向（分位高=股息高=便宜） */
function pctColor(pct: number | null | undefined, key: string): string {
  if (pct == null) return '#888780';
  const v = key === 'dy_ttm' ? 100 - Number(pct) : Number(pct);
  if (v >= 80) return '#e24b4a';
  if (v >= 60) return '#ef9f27';
  if (v <= 20) return '#3b9a4b';
  if (v <= 40) return '#97c459';
  return '#888780';
}

function barWidth(pct: number | null | undefined): string {
  return `${Math.max(0, Math.min(100, Number(pct ?? 0)))}%`;
}

const pctRows = computed(() => {
  const p = stats.value?.percentile;
  if (!p) return [];
  return METRIC_KEYS.map(key => ({
    key,
    label: METRIC_NAMES[key],
    current: p.current?.[key] ?? null,
    pct: p.pct?.[key],
    status: p.status?.[key] ?? 'ok'
  }));
});

const valuationSeries = computed<Record<string, (number | null)[]>>(() => {
  const s = stats.value;
  return s?.valuation ? { [s.metric]: s.valuation.values } : {};
});
const valuationNames = computed<Record<string, string>>(() => {
  const s = stats.value;
  return { [s?.metric ?? 'pe_ttm']: s?.metric_label ?? '' };
});
const valuationVisible = computed(() => [stats.value?.metric ?? 'pe_ttm']);

const summary = computed(() => stats.value?.performance?.summary ?? null);
const freshness = computed(() => stats.value?.freshness ?? null);

/**
 * 交易日口径（复用风险引擎 _stale_days，按 bds_trade_date 计数）：
 * 0=当日、1=T−1（收盘后同步，正常状态）、≥2 才是真滞后。
 * 数据齐全时也只报数据末日，不报最新交易日（那是日历，不是数据）。
 */
const freshnessTag = computed(() => {
  const f = freshness.value;
  if (!f) return null;
  if (f.stale_days == null) return { type: 'default' as const, text: '无落表行情' };
  const asOf = f.price_as_of ?? '—';
  if (f.stale_days >= 2)
    return { type: 'warning' as const, text: `数据截至 ${asOf} · T−${f.stale_days} 个交易日（滞后）` };
  if (f.stale_days === 1) return { type: 'success' as const, text: `数据截至 ${asOf} · T−1（收盘后同步）` };
  return { type: 'success' as const, text: `数据截至 ${asOf}（当日）` };
});

const subjectLabel = computed(() => {
  const t = stats.value?.subject_type;
  return t === 'index' ? '指数估值表' : t === 'stock' ? '个股日频估值表' : '未覆盖估值源';
});
</script>

<template>
  <div class="flex flex-col gap-16px pb-16px">
    <!-- 控件：区间 / 指标 / 新鲜度 -->
    <div class="flex flex-wrap items-center gap-12px">
      <NSelect v-model:value="range" :options="RANGE_OPTIONS" class="w-140px" />
      <NSelect v-model:value="metric" :options="METRIC_OPTIONS" class="w-160px" />
      <NTag size="small" :bordered="false" type="info">{{ subjectLabel }}</NTag>
      <NTag v-if="freshnessTag" size="small" :bordered="false" :type="freshnessTag.type">
        {{ freshnessTag.text }}
      </NTag>
      <span class="text-12px op-60">
        分位锚点 {{ freshness?.percentile_as_of ?? '—' }} · 估值末日 {{ freshness?.valuation_as_of ?? '—' }}
      </span>
    </div>

    <NSpin :show="loading">
      <NAlert v-if="loadError" type="error" title="估值与走势数据加载失败">
        换个区间重试，或检查后端同步任务状态。
      </NAlert>

      <template v-else-if="stats">
        <NAlert v-if="stats.message" type="warning" class="mb-12px">{{ stats.message }}</NAlert>

        <!-- 无估值/行情标的：主表行情字段降级（明确不是收益率/回撤） -->
        <section v-if="!stats.coverage.valuation && !stats.coverage.price && stats.fallback" class="mb-16px">
          <SectionBar title="主表行情字段（降级展示）" />
          <NDescriptions :column="2" bordered size="small">
            <NDescriptionsItem label="最新价">{{ fmt(stats.fallback.price, 4) }}</NDescriptionsItem>
            <NDescriptionsItem label="上年末">{{ fmt(stats.fallback.py_close, 4) }}</NDescriptionsItem>
            <NDescriptionsItem label="年高">{{ fmt(stats.fallback.y_high, 4) }}</NDescriptionsItem>
            <NDescriptionsItem label="年低">{{ fmt(stats.fallback.y_low, 4) }}</NDescriptionsItem>
            <NDescriptionsItem label="年内涨跌">
              <span :style="{ color: trendColor(stats.fallback.ytd_return_pct) }">
                {{ fmtPct(stats.fallback.ytd_return_pct, true) }}
              </span>
            </NDescriptionsItem>
            <NDescriptionsItem label="距年高">{{ fmtPct(stats.fallback.to_high_pct, true) }}</NDescriptionsItem>
            <NDescriptionsItem label="距年低">{{ fmtPct(stats.fallback.to_low_pct, true) }}</NDescriptionsItem>
          </NDescriptions>
          <div class="mt-8px text-12px op-60">
            以上来自标的主表行情字段，非累计收益率、非回撤；该标的暂无日频序列可算。
          </div>
        </section>

        <!-- ① 估值分位：唯一入口 irs_um_percentile 最新截面 -->
        <section v-if="stats.coverage.percentile && stats.percentile" class="mb-16px">
          <SectionBar title="估值分位">
            <span class="text-12px op-60">最新截面 · 4 指标 × 3 窗口（日历对日口径）</span>
          </SectionBar>
          <div class="grid grid-cols-4 gap-12px">
            <div
              v-for="row in pctRows"
              :key="row.key"
              class="rounded-8px p-12px"
              style="border: 1px solid rgba(128, 128, 128, 0.25)"
            >
              <div class="mb-6px flex items-baseline justify-between">
                <span class="text-13px font-500">{{ row.label }}</span>
                <span class="text-16px font-500">{{ fmt(row.current, 4) }}</span>
              </div>
              <div v-if="row.status !== 'ok'" class="mb-6px text-11px" style="color: #e24b4a">
                {{ row.status === 'no_data' ? '估值源无数据' : '当前值无效' }} · 分位不参与判读
              </div>
              <div class="mb-4px flex items-center justify-between text-11px op-60">
                <span>10 年分位</span>
                <span>{{ fmt(row.pct?.['10y'], 1) }}%</span>
              </div>
              <div class="h-6px w-full overflow-hidden rounded-3px" style="background: rgba(128, 128, 128, 0.2)">
                <div
                  class="h-full rounded-3px"
                  :style="{ width: barWidth(row.pct?.['10y']), background: pctColor(row.pct?.['10y'], row.key) }"
                ></div>
              </div>
              <div class="mt-8px grid grid-cols-3 gap-4px text-11px op-70">
                <span>3年 {{ fmt(row.pct?.['3y'], 1) }}%</span>
                <span>5年 {{ fmt(row.pct?.['5y'], 1) }}%</span>
                <span>10年 {{ fmt(row.pct?.['10y'], 1) }}%</span>
              </div>
            </div>
          </div>
          <div class="mt-8px text-12px op-60">
            股息率数字为原始分位、染色按便宜度反向（高股息=便宜）。锚点 {{ stats.percentile.as_of ?? '—' }} · 上游末日
            {{ stats.percentile.source_as_of ?? '—' }} · 落盘 {{ stats.percentile.calc_at ?? '—' }}
            <template v-if="stats.percentile.status_note">· {{ stats.percentile.status_note }}</template>
          </div>
        </section>
        <NAlert v-else-if="stats.coverage.price || stats.coverage.valuation" type="info" class="mb-12px">
          最新估值分位截面缺失（该标的未落盘），分位区不展示；其余数据照常。
        </NAlert>

        <!-- ② 估值数据：原始值序列，不是分位序列 -->
        <section v-if="stats.valuation" class="mb-16px">
          <SectionBar :title="`估值数据 · ${stats.metric_label}`">
            <span class="text-12px op-60">
              当前值 {{ fmt(stats.valuation.current, 4) }} · 截至 {{ stats.valuation.as_of ?? '—' }}
            </span>
          </SectionBar>
          <ValuationChart
            :dates="stats.valuation.dates"
            :series="valuationSeries"
            :names="valuationNames"
            :visible="valuationVisible"
            :metric-label="stats.metric_label"
          />
        </section>

        <!-- ③④ 累计收益率 + 回撤：同一条价格序列 -->
        <section v-if="stats.performance" class="mb-16px">
          <SectionBar title="累计收益率与回撤">
            <span class="text-12px op-60">
              {{ summary?.start_date ?? '—' }} ~ {{ summary?.end_date ?? '—' }} ·
              {{ stats.performance.adjust === 'post' ? '个股后复权价' : '指数不复权点位' }}
            </span>
          </SectionBar>
          <div class="mb-12px grid grid-cols-4 gap-12px">
            <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
              <div class="text-12px op-60">区间累计收益率</div>
              <div class="mt-4px text-18px font-500" :style="{ color: trendColor(summary?.cum_return) }">
                {{ fmtPct(summary?.cum_return, true) }}
              </div>
            </div>
            <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
              <div class="text-12px op-60">当前回撤</div>
              <div class="mt-4px text-18px font-500" style="color: #3b9a4b">
                {{ fmtPct(summary?.current_drawdown) }}
              </div>
            </div>
            <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
              <div class="text-12px op-60">区间最大回撤</div>
              <div class="mt-4px text-18px font-500" style="color: #3b9a4b">
                {{ fmtPct(summary?.max_drawdown) }}
              </div>
            </div>
            <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
              <div class="text-12px op-60">峰值日 / 谷底日</div>
              <div class="mt-4px text-13px">
                {{ summary?.max_dd_peak_date ?? '—' }} → {{ summary?.max_dd_trough_date ?? '—' }}
              </div>
              <div class="mt-2px text-11px op-60">
                {{ summary?.recovered ? `已修复 ${summary.recover_date ?? ''}` : '区间内未回到前高' }}
              </div>
            </div>
          </div>
          <PerformanceChart
            :dates="stats.performance.dates"
            :cum-return="stats.performance.cum_return"
            :drawdown="stats.performance.drawdown"
          />
          <div class="mt-8px text-12px op-60">
            首日收盘 {{ fmt(stats.performance.first_close, 4) }} → 末日 {{ fmt(stats.performance.last_close, 4) }}；
            回撤为区间内相对历史峰值，最大回撤是本区间值、不是全史；不补实时价。
          </div>
        </section>

        <!-- 口径脚注 -->
        <div class="rounded-8px p-12px text-12px leading-20px op-60" style="border: 1px solid rgba(128, 128, 128, 0.2)">
          口径：分位来自
          <code>irs_um_percentile</code>
          最新截面（不做历史分位曲线，按日历史分位表尚未同步到最新）； 估值曲线是原始值序列。累计收益率 =
          区间首日收盘价归一，
          <b>不含杠杆、持仓成本与费用，不等于账户收益率</b>
          ； 个股用后复权价、指数用不复权点位。所有数值由后端计算，前端只渲染。
        </div>
      </template>

      <div v-else class="py-40px text-center text-gray-400">载入中…</div>
    </NSpin>
  </div>
</template>
