<script setup lang="ts">
defineOptions({ name: 'PercentileCards' });

/**
 * 估值分位卡片（IRs 决策区）
 *
 * 每张卡：当前值 + 10 年分位条 + 3/5/全史 + 成分新鲜度。
 * 数字全部来自 `/bds/index-valuation-percentiles`，前端只做染色（>80 红 / <20 绿），
 * 不在这里算任何分位。
 */
interface Props {
  items: Api.Bds.IndexValuationPercentile[];
  /** 指标名，如 'PE(TTM)'，用于卡片上标注「当前值」是什么 */
  metricLabel: string;
}

const props = defineProps<Props>();

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(digits);
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

function barWidth(pct: number | null | undefined): string {
  return `${Math.max(0, Math.min(100, Number(pct ?? 0)))}%`;
}
</script>

<template>
  <div>
    <NGrid :cols="5" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
      <NGridItem v-for="item in props.items" :key="item.index_code" span="5 s:1">
        <div class="rounded-8px p-12px" style="border: 1px solid rgba(128, 128, 128, 0.25)">
          <div class="mb-6px flex items-baseline justify-between">
            <span class="text-14px font-500">{{ item.sec_name || item.index_code }}</span>
            <span class="text-18px font-600">{{ fmt(item.current) }}</span>
          </div>

          <div class="mb-4px flex items-center justify-between text-11px op-60">
            <span>10年分位</span>
            <span>{{ item.pct_10y?.pct != null ? item.pct_10y.pct.toFixed(1) + '%' : '-' }}</span>
          </div>
          <div class="h-6px w-full overflow-hidden rounded-3px" style="background: rgba(128, 128, 128, 0.2)">
            <div
              class="h-full rounded-3px transition-all"
              :style="{ width: barWidth(item.pct_10y?.pct), background: pctColor(item.pct_10y?.pct) }"
            ></div>
          </div>

          <div class="mt-8px grid grid-cols-3 gap-4px text-11px op-70">
            <span>3年 {{ item.pct_3y?.pct != null ? item.pct_3y.pct.toFixed(0) + '%' : '-' }}</span>
            <span>5年 {{ item.pct_5y?.pct != null ? item.pct_5y.pct.toFixed(0) + '%' : '-' }}</span>
            <span>全史 {{ item.pct_all?.pct != null ? item.pct_all.pct.toFixed(0) + '%' : '-' }}</span>
          </div>

          <div class="mt-8px text-11px leading-16px op-55">
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
          </div>

          <div class="mt-6px text-11px op-40">当前 {{ props.metricLabel }} · {{ item.last_date || '-' }}</div>
        </div>
      </NGridItem>
    </NGrid>
    <NEmpty
      v-if="props.items.length === 0"
      description="暂无估值数据，先到 BDs →「指数估值」跑一次重算"
      class="py-24px"
    />
  </div>
</template>
