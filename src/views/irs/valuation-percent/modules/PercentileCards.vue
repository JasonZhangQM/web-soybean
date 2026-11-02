<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'PercentileCards' });

/**
 * 估值分位卡片（IRs 决策区）
 *
 * 每张卡：当前值 + 10 年分位条 + 3/5/全史 + 新鲜度/覆盖信息。
 * 数字全部来自后端分位接口（指数 `/bds/index-valuation-percentiles`、
 * 个股 `/bds/stock-valuation-percentiles`），前端只做染色，不在这里算任何分位。
 *
 * 股息率是反向指标（分位高=股息高=便宜）：**数字保持原始分位**（便于与表格/PE 并排核对），
 * 染色按便宜度反转（100−pct）——页头有说明，避免"数字 94% 却标绿"被当成 bug。
 */
interface Props {
  items: (Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile)[];
  /** 指标名，如 'PE(TTM)'，用于卡片上标注「当前值」是什么 */
  metricLabel: string;
  /** 指标键，用于识别 dy_ttm（反向染色） */
  metric: string;
  /** index=指数模式（成分新鲜度）；stock=个股模式（上市/覆盖信息） */
  mode: 'index' | 'stock';
}

const props = defineProps<Props>();

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(digits);
}

/** 行键：指数用 index_code，个股用 symbol */
function codeOf(item: Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile): string {
  return 'index_code' in item ? item.index_code : item.symbol;
}

function isStock(
  item: Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile
): item is Api.Bds.StockValuationPercentile {
  return !('index_code' in item);
}

/** 分位配色：高分位=贵=红，低分位=便宜=绿（A 股习惯，与涨红跌绿一致）；中间为中性 */
function pctColor(pct: number | null | undefined): string {
  if (pct == null) return 'var(--n-border-color, #d9d9d9)';
  if (pct >= 80) return '#e24b4a';
  if (pct >= 60) return '#ef9f27';
  if (pct <= 20) return '#3b9a4b';
  if (pct <= 40) return '#97c459';
  return '#888780';
}

/** 股息率反向：染色看便宜度（100−pct），数字仍显示原始分位 */
function dyeColor(item: Api.Bds.IndexValuationPercentile | Api.Bds.StockValuationPercentile): string {
  const pct = item.pct_10y?.pct;
  if (pct == null) return pctColor(null);
  return pctColor(props.metric === 'dy_ttm' ? 100 - pct : pct);
}

function barWidth(pct: number | null | undefined): string {
  return `${Math.max(0, Math.min(100, Number(pct ?? 0)))}%`;
}

/** 个股覆盖信息行：上市日 + 数据覆盖 + 有效样本数（替代指数模式的"名单/核查水位"） */
function coverageLine(item: Api.Bds.StockValuationPercentile): string {
  return `上市 ${item.online_date || '-'} · 数据 ${item.first_date || '-'} ~ ${item.last_date || '-'}（有效 ${item.cleaned_n} 天）`;
}

/** 个股模式卡片网格：1~2 只时 5 列会把卡挤得过窄，按响应式放宽 */
const gridCols = computed(() => (props.mode === 'stock' ? '1 s:2 l:3' : 5));
</script>

<template>
  <div>
    <NGrid :cols="gridCols" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
      <NGridItem v-for="item in props.items" :key="codeOf(item)" span="5 s:1">
        <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
          <div class="mb-6px flex items-baseline justify-between">
            <span class="text-14px font-500">{{ item.sec_name || codeOf(item) }}</span>
            <span class="text-18px font-600">{{ fmt(item.current) }}</span>
          </div>

          <!-- 个股当前值无效：不参与分位，必须一眼看到原因（否则空卡片像坏了） -->
          <div v-if="isStock(item) && item.status !== 'ok'" class="mb-6px">
            <div class="text-11px" style="color: #e24b4a; font-weight: 600">
              {{ item.status === 'no_data' ? '估值源无数据' : '当前值无效，不参与分位' }}
            </div>
            <div v-if="item.status_note" class="text-11px op-70">{{ item.status_note }}</div>
          </div>

          <div class="mb-4px flex items-center justify-between text-11px op-60">
            <span>10年分位</span>
            <span>{{ item.pct_10y?.pct != null ? item.pct_10y.pct.toFixed(1) + '%' : '-' }}</span>
          </div>
          <div class="h-6px w-full overflow-hidden rounded-3px" style="background: rgba(128, 128, 128, 0.2)">
            <div
              class="h-full rounded-3px transition-all"
              :style="{ width: barWidth(item.pct_10y?.pct), background: dyeColor(item) }"
            ></div>
          </div>

          <div class="mt-8px grid grid-cols-3 gap-4px text-11px op-70">
            <span>3年 {{ item.pct_3y?.pct != null ? item.pct_3y.pct.toFixed(0) + '%' : '-' }}</span>
            <span>5年 {{ item.pct_5y?.pct != null ? item.pct_5y.pct.toFixed(0) + '%' : '-' }}</span>
            <span title="全历史含股权分置改革、会计准则变更等制度断点，仅作参考，勿与 10 年分位并排比较">
              全史* {{ item.pct_all?.pct != null ? item.pct_all.pct.toFixed(0) + '%' : '-' }}
            </span>
          </div>

          <div class="mt-8px text-11px leading-16px op-55">
            <!-- 指数模式：成分新鲜度 -->
            <template v-if="!isStock(item)">
              <div>
                名单自 {{ item.last_change_date || '-' }} 未变 · 核查至
                {{ item.constituent_checked_to || '-' }}
              </div>
              <div v-if="item.constituent_stale" class="text-11px" style="color: #ef9f27">
                成分未核查至末日，分位可信度打折
              </div>
              <div v-else-if="item.constituent_gap_days" class="text-11px" style="color: #ef9f27">
                {{ item.constituent_gap_days }} 个交易日未确认
              </div>
            </template>
            <!-- 个股模式：上市/覆盖信息 -->
            <template v-else>
              <div :title="`${item.industry || ''} ${item.board || ''}`.trim()">
                {{ coverageLine(item) }}
              </div>
              <div v-if="item.windows_short.length" class="text-11px" style="color: #ef9f27">
                上市不足窗口期（{{ item.windows_short.map(w => w.replace('pct_', '')).join('、') }} 年样本 &lt; 250
                天），对应分位参考价值打折
              </div>
            </template>
          </div>

          <!-- 陈旧度：当前值所属交易日 + 是否落后于最新可算数据。不写清楚就会把 T-N 当"当前" -->
          <div class="mt-6px flex items-center justify-between text-11px">
            <span class="op-40">当前 {{ props.metricLabel }}</span>
            <span :style="item.is_stale ? 'color:#ef9f27;font-weight:600' : 'opacity:0.4'">
              截至 {{ item.as_of || item.last_date || '-' }}
            </span>
          </div>
          <div v-if="item.is_stale" class="mt-2px text-11px" style="color: #ef9f27">
            估值落后最新数据 {{ item.stale_days }} 天 ⇒ 当前值非最新
          </div>
        </div>
      </NGridItem>
    </NGrid>
    <NEmpty
      v-if="props.items.length === 0"
      :description="
        props.mode === 'stock' ? '搜索并选择个股后展示分位' : '暂无估值数据，先到 BDs →「指数估值」跑一次重算'
      "
      class="py-24px"
    />
  </div>
</template>
