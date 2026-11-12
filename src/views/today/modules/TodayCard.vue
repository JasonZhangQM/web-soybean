<script setup lang="ts">
/**
 * 今日标的卡片（今日页与标的推演共用）
 *
 * 信息全部来自 GET /irs/today 的 TodayItem（口径后端算，铁律 4.5）：
 * 标题（优先级标签）→ 现价 + PE/PB 分位 → 档位刻度条（TierScaleBar，支持假设价
 * 第二游标）→ 命中剧本 → 逻辑/证伪/复核/裸仓 → 目标/当前/漂移。
 *
 * 复用约定：
 * - 今日页：默认插槽留空，仅 @detail / @edit-target 两个出口；
 * - 标的推演：传 hypoPrice（刻度条第二游标 + 「已改动」角标），
 *   用 #footer 插槽放假设价滑块。
 *
 * 刻度条回退守卫 tierBarOk：五档价齐全且严格递增、有现价；不满足回退旧文案。
 */
import { NButton, NCard, NTag } from 'naive-ui';
import TierScaleBar from './TierScaleBar.vue';

defineProps<{
  item: Api.Irs.TodayItem;
  /** 假设价（标的推演）：传了就在刻度条上叠第二游标并亮「已改动」角标 */
  hypoPrice?: number | null;
  /** 是否与现价不同（驱动「已改动」角标） */
  changed?: boolean;
}>();

const emit = defineEmits<{
  detail: [];
  editTarget: [];
}>();

/** 优先级 → 显示标签与底色（1红 2/3橙黄 4蓝 5灰） */
const PRIORITY_META: Record<number, { label: string; type: 'error' | 'warning' | 'info' | 'default' }> = {
  1: { label: '证伪触发', type: 'error' },
  2: { label: '剧本命中', type: 'warning' },
  3: { label: '裸仓', type: 'warning' },
  4: { label: '复核到期', type: 'info' },
  5: { label: '没事', type: 'default' }
};

/** 价格：去尾零的两位小数 */
function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return String(
    Number(v)
      .toFixed(2)
      .replace(/\.?0+$/, '')
  );
}

/** 已经是百分比刻度的值（如 target_pct / current_pct / nearest_level_pct / drift） */
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toFixed(2)}%`;
}

/** 百分制分位值（pe_pct / pb_pct，后端已返回 0~100），直接补 % */
function fmtPct100(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

/** 漂移标色：±2% 黄、±5% 红（P3-2 超阈标色） */
function driftClass(drift: number | null | undefined) {
  if (drift == null) return '';
  const a = Math.abs(Number(drift));
  if (a >= 5) return 'text-red-500';
  if (a >= 2) return 'text-orange-500';
  return '';
}

/**
 * 刻度条可渲染条件：五档价齐全且严格递增、有现价（防手填数据错序）。
 * 不满足时回退旧的「zone 标签 + 距档位」文案。
 */
function tierBarOk(it: Api.Irs.TodayItem) {
  if (!it.pp || !it.pv || it.price == null) return false;
  const seq = [it.pp.pp_el, it.pp.pp_l, it.pp.pp_m, it.pp.pp_h, it.pp.pp_eh];
  return seq.every(v => v != null) && seq.every((v, i) => i === 0 || Number(seq[i - 1]) < Number(v));
}
</script>

<template>
  <NCard size="small">
    <template #header>
      <div class="flex flex-wrap items-center gap-8px">
        <NButton text class="font-600" @click="emit('detail')">
          {{ item.name || item.symbol }}
        </NButton>
        <span class="text-12px text-gray-400">{{ item.symbol }}</span>
        <NTag size="tiny" :bordered="false" :type="PRIORITY_META[item.priority]?.type ?? 'default'">
          {{ PRIORITY_META[item.priority]?.label ?? item.priority }}
        </NTag>
        <NTag v-if="changed" size="tiny" :bordered="false" round class="!text-green-500">已改动</NTag>
      </div>
    </template>

    <div class="flex flex-col gap-8px">
      <!-- 现价 + PE/PB 分位 -->
      <div class="flex flex-wrap items-baseline gap-8px">
        <span class="text-20px font-600">{{ fmtPrice(item.price) }}</span>
        <NTag v-if="item.pe_pct != null || item.pb_pct != null" size="tiny" :bordered="false" type="warning">
          PE {{ fmtPct100(item.pe_pct) }} / PB {{ fmtPct100(item.pb_pct) }}
        </NTag>
        <span v-if="item.pe_pct != null || item.pb_pct != null" class="text-11px text-gray-400">10y 分位</span>
      </div>

      <!-- 档位刻度条（五档价与距档 % 直接标在刻度下） -->
      <TierScaleBar v-if="tierBarOk(item)" :item="item" :hypo-price="hypoPrice" />
      <!-- 数据无效（无版本/档位缺/错序）回退旧文案 -->
      <div v-else class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" type="info">{{ item.zone || '—' }}</NTag>
        <span class="text-12px text-gray-400">距档位 {{ fmtPct(item.nearest_level_pct) }}</span>
      </div>

      <!-- 命中的剧本动作 -->
      <div v-if="item.hit_plans.length" class="mt-4px">
        <div class="mb-4px text-12px text-gray-500">命中剧本</div>
        <div v-for="(p, i) in item.hit_plans" :key="i" class="mb-4px text-12px">
          {{ p.trade_symbol }} {{ p.b_s }}{{ p.o_c || '' }}
          <span class="text-gray-400">@ {{ fmtPrice(p.effective_trigger) }}</span>
          <div v-if="p.reason" class="text-11px text-gray-400">{{ p.reason }}</div>
        </div>
      </div>

      <!-- 逻辑 / 证伪 / 复核 / 裸仓 -->
      <div class="mt-4px flex flex-wrap gap-6px text-12px">
        <NTag size="tiny" :bordered="false" :type="item.logic_weak ? 'warning' : 'default'">
          逻辑 {{ item.logic_total }}
          <template v-if="item.logic_weak">（减弱 {{ item.logic_weak }}）</template>
        </NTag>
        <NTag v-if="item.invalidate_triggered" size="tiny" :bordered="false">
          证伪触发 {{ item.invalidate_triggered }}
        </NTag>
        <NTag v-if="item.review_due" size="tiny" :bordered="false" type="info">复核到期</NTag>
        <NTag v-if="item.naked" size="tiny" :bordered="false" type="warning">裸仓</NTag>
      </div>

      <!-- 目标 / 当前 / 漂移（P3-2） -->
      <div class="mt-4px flex items-center gap-8px border-t border-gray-100 pt-8px text-12px">
        <span>
          目标
          <b>{{ fmtPct(item.target_pct) }}</b>
        </span>
        <span>
          当前
          <b>{{ fmtPct(item.current_pct) }}</b>
        </span>
        <span :class="driftClass(item.drift)">
          漂移
          <b>{{ fmtPct(item.drift) }}</b>
        </span>
        <NButton size="tiny" text class="ml-auto" @click="emit('editTarget')">设目标</NButton>
      </div>

      <!-- 扩展插槽（标的推演放假设价滑块） -->
      <slot name="footer" />
    </div>
  </NCard>
</template>
