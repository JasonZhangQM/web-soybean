<script setup lang="ts">
/**
 * 档位刻度条（风险总览 /risk 左栏标的卡片专用，2026-11-13 自今日页迁入）
 *
 * 真实价格轴：刻度按档位实际价格定位（不再均分），轴域 = [min(极低,现价), max(极高,现价)]，
 * 现价纳入轴域 ⇒ 游标永远在轴内真实位置，无需钳制；现价超界时五档整体内收
 * （跌破整个档位体系一眼可见），并保留「超出极高/低于极低 X%」红字提示。
 *
 * 渐变色带：绿（极低）→ 琥珀（中）→ 红（极高），渐变停靠点跟随各档实际位置，
 * 颜色与价格语义对齐。低=便宜=绿，高=贵=红。
 *
 * 标签布局（2026-11-14 用户要求）：档名一行在上，档位价 / 距该档 %（pv，负 = 档位在现价
 * 下方）两行数字在下；三行全部锁死同一水平位置、按刻度百分比居中，**取消两行交错避让**
 * —— 档位挤在一起时标签横向贴近甚至叠字，靠 hover tooltip 兜底，不再分行。
 * 标签一律 nowrap：首尾刻度（极低/极高）贴容器边缘，收缩宽度会被钳成 0 导致竖排换行，
 * nowrap 后允许伸出容器边缘（卡片有内边距兜着）。
 * 不展示「现价 X · 位于低~中」这类冗余文字。
 *
 * 数据来源已改为 GET /irs/underlying-monitors（今日待办下线），pp/pv 由调用方
 * 用 types.toSubjectRow 归一化成短键映射；纯几何渲染，口径仍是后端的 zone/pv（铁律 4.5）。
 * 数据无效（任一档为空 / 五档非严格递增 / 无现价）由父组件判断，回退旧文案。
 */
import { computed } from 'vue';
import { TIER_BANDS, TIER_NAMES, type TierBand, type TierMap } from './types';

const props = defineProps<{
  /** 五档价；由调用方 Number 化后传入，任一为空即不渲染（父级已判） */
  pp: TierMap | null;
  /** 距各档 %（负 = 档位在现价下方） */
  pv: TierMap | null;
  /** 现价 */
  price: number | null;
  /** 假设价（标的推演滑块）：叠加第二游标，与现价游标同轴；空/未传不渲染 */
  hypoPrice?: number | null;
}>();

/** 五档刻度定义：短键 + 中文名 + 冷暖色调（与 types.TIER_BANDS 同序，禁另写一份顺序） */
const TONES: Record<TierBand, 'low' | 'mid' | 'high'> = {
  el: 'low',
  l: 'low',
  m: 'mid',
  h: 'high',
  eh: 'high'
};
const TIERS = TIER_BANDS.map(b => ({ band: b, name: TIER_NAMES[b], tone: TONES[b] }));

/** 渐变停靠色（随各档实际位置布点，绿→琥珀→红） */
const TIER_COLORS = ['#0F6E56', '#5DCAA5', '#EF9F27', '#F0997B', '#D85A30'];

function num(v: number | null | undefined) {
  return v == null ? null : Number(v);
}

const ppVals = computed(() => TIERS.map(t => num(props.pp?.[t.band])));
const pvVals = computed(() => TIERS.map(t => num(props.pv?.[t.band])));
const priceVal = computed(() => num(props.price));

/** 轴域：把现价纳入 [lo, hi]，游标永远在轴内 */
const axis = computed(() => {
  const price = priceVal.value;
  const pp = ppVals.value;
  if (price == null || pp.some(v => v == null)) return null;
  const p = pp as number[];
  return { lo: Math.min(p[0], price), hi: Math.max(p[4], price) };
});

function toPct(v: number) {
  const a = axis.value;
  if (!a || a.hi <= a.lo) return 0;
  return ((v - a.lo) / (a.hi - a.lo)) * 100;
}

const tickPcts = computed(() => {
  if (!axis.value) return null;
  return (ppVals.value as number[]).map(v => toPct(v));
});

const markerPct = computed(() => (axis.value && priceVal.value != null ? toPct(priceVal.value) : null));

/** 假设价游标：钳进轴内（超界只贴边显示，不影响后端口径） */
const hypoPct = computed(() => {
  if (!axis.value || props.hypoPrice == null) return null;
  return Math.min(100, Math.max(0, toPct(Number(props.hypoPrice))));
});

/** 渐变背景：停靠点跟随各档实际位置（档位挤在一起时渐变同步压缩） */
const gradientCss = computed(() => {
  const t = tickPcts.value;
  if (!t) return 'transparent';
  const stops = t.map((p, i) => `${TIER_COLORS[i]} ${p.toFixed(2)}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
});

/** 超界方向与幅度 %（只做展示性减法，不算口径） */
const overRange = computed(() => {
  const price = priceVal.value;
  const pp = ppVals.value;
  if (price == null || pp.some(v => v == null)) return null;
  const p = pp as number[];
  if (price > p[4]) return { side: 'high' as const, pct: (price / p[4] - 1) * 100 };
  if (price < p[0]) return { side: 'low' as const, pct: (p[0] / price - 1) * 100 };
  return null;
});

/** 当前所在档位（用于刻度名高亮） */
const zoneIdx = computed(() => {
  const price = priceVal.value;
  const pp = ppVals.value;
  if (price == null || pp.some(v => v == null)) return -1;
  const p = pp as number[];
  if (price <= p[0]) return 0;
  if (price >= p[4]) return 4;
  for (let i = 0; i < 4; i += 1) {
    if (price <= p[i + 1]) return i + 1;
  }
  return -1;
});

// ---------------- 标签布局：三行锁死同一 y，取消交错 ----------------

/** 档名 / 档位价 / 距档% 三行的固定 y 与标签区总高（行高 16px + 2px 余量） */
const NAME_TOP = 0;
const PRICE_TOP = 18;
const PV_TOP = 34;
const LABELS_H = 50;

/** 档名定位：按刻度百分比居中，单行锁死 NAME_TOP（取消交错后不再需要实测盒宽） */
function labelNameStyle(i: number) {
  const t = tickPcts.value;
  if (!t) return {};
  return { left: `${t[i]}%`, transform: 'translateX(-50%)', top: `${NAME_TOP}px` };
}

/** 数字定位：档位价 / 距档% 各占一行、按刻度百分比居中，锁死同一 y */
function labelNumStyle(i: number, row: 'price' | 'pv') {
  const t = tickPcts.value;
  const top = row === 'price' ? PRICE_TOP : PV_TOP;
  if (!t) return { top: `${top}px` };
  return { left: `${t[i]}%`, transform: 'translateX(-50%)', top: `${top}px` };
}

/** 价格去尾零（与今日页 fmtPrice 同口径） */
function fmtPrice(v: number | null) {
  if (v == null) return '—';
  return String(
    Number(v)
      .toFixed(2)
      .replace(/\.?0+$/, '')
  );
}

/** 距档 %：带符号一位小数（负 = 档位在现价下方） */
function fmtPv(v: number | null) {
  if (v == null) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}
</script>

<template>
  <div class="mx-14px select-none">
    <!-- 渐变色带：停靠点在各档实际位置 -->
    <div class="relative h-14px">
      <div class="h-full rounded-4px" :style="{ background: gradientCss }" />
      <!-- 五档刻度细线（真实位置） -->
      <div
        v-for="(t, i) in tickPcts"
        :key="`tick-${i}`"
        class="absolute top-0 h-full w-1px"
        :style="{ left: `${t}%`, background: 'rgba(255,255,255,0.65)' }"
      />
      <!-- 当前价游标：细线贯穿色带 + 上方倒三角（真实位置） -->
      <template v-if="markerPct !== null">
        <div
          class="absolute top-0 h-full w-2px opacity-80"
          :style="{ left: `${markerPct}%`, transform: 'translateX(-50%)', background: 'currentColor' }"
        />
        <div
          class="absolute"
          :style="{
            left: `${markerPct}%`,
            top: '-7px',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '7px solid currentColor'
          }"
        />
      </template>
      <!-- 假设价游标：圆形点（标的推演滑块联动） -->
      <template v-if="hypoPct !== null">
        <div
          class="absolute top-4px h-10px w-10px rounded-full border-2px border-white bg-green-500 shadow"
          :style="{ left: `${hypoPct}%`, transform: 'translateX(-50%)' }"
          title="假设价（滑块设定）"
        />
      </template>
      <!-- 超界提示 -->
      <div
        v-if="overRange"
        class="absolute -top-20px text-12px text-red-500"
        :style="overRange.side === 'high' ? { right: 0 } : { left: 0 }"
      >
        {{ overRange.side === 'high' ? '超出极高' : '低于极低' }} {{ fmtPv(overRange.pct) }}
      </div>
    </div>

    <!-- 五档刻度标签：档名一行在上、数字两行在下，三行锁死同一水平（取消交错，挤时允许叠字） -->
    <div class="relative mt-4px" :style="{ height: `${LABELS_H}px` }">
      <div
        v-for="(t, i) in TIERS"
        :key="`name-${t.band}`"
        class="absolute whitespace-nowrap text-center text-12px"
        :class="[
          i === zoneIdx ? 'font-600' : '',
          t.tone === 'low' ? 'text-green-600' : t.tone === 'high' ? 'text-red-500' : 'text-amber-500'
        ]"
        :style="labelNameStyle(i)"
        :title="`${t.name}：档位价 ${fmtPrice(ppVals[i])}，距该档 ${fmtPv(pvVals[i])}`"
      >
        {{ t.name }}
      </div>
      <div
        v-for="(t, i) in TIERS"
        :key="`price-${t.band}`"
        class="absolute whitespace-nowrap text-center text-11px text-gray-400"
        :style="labelNumStyle(i, 'price')"
      >
        {{ fmtPrice(ppVals[i]) }}
      </div>
      <div
        v-for="(t, i) in TIERS"
        :key="`pv-${t.band}`"
        class="absolute whitespace-nowrap text-center text-11px text-gray-400"
        :style="labelNumStyle(i, 'pv')"
      >
        {{ fmtPv(pvVals[i]) }}
      </div>
    </div>
  </div>
</template>
