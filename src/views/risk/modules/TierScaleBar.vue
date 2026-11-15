<script setup lang="ts">
/**
 * 档位刻度条（风险总览 /risk 左栏标的卡片专用，2026-11-13 自今日页迁入）
 *
 * 2026-11-15 合并「档位条 + 快速定位滑块」，本组件由纯展示升级为唯一价格轴：
 *   - 单击 / 按住拖动色带 = 设假设价（pointer 事件，鼠标与触屏同一套）；
 *   - 点击条下方任一档的三行文字（档名 / 档位价 / 距档%）= 假设价精确设为该档；
 *   - 主路径的独立 NSlider 下线，只在「无五档版本」的降级分支由调用方保留。
 * 轴域按用户确认「不留 padding」：仍是 [min(极低,现价), max(极高,现价)]，
 * 五档紧贴两端，现价纳入轴域 ⇒ 游标永远在轴内真实位置、无需钳制；
 * 滑动范围就是档位区间（现价超界时轴被撑到现价，红字提示照常），
 * 不再能拖出档位体系之外 —— 这是与旧 NSlider（两端留 10%）的刻意差异。
 *
 * 真实价格轴：刻度按档位实际价格定位（不再均分）；渐变色带绿（极低）→ 琥珀（中）
 * → 红（极高），停靠点跟随各档实际位置，颜色与价格语义对齐。现价超界时五档整体内收。
 *
 * 标签布局：档名一行在上，档位价 / 距该档 %（pv，负 = 档位在现价下方）两行数字在下；
 * 三行锁死同一水平位置、按刻度百分比居中，取消两行交错避让 —— 挤在一起时允许叠字，
 * 靠 hover tooltip 兜底。2026-11-15 起三行合并成「一个可点列」：hover 时抬升 z-index，
 * 避免叠字时点到被压住的那一档；标签一律 nowrap，首尾允许伸出容器边缘。
 * 不展示「现价 X · 位于低~中」这类冗余文字。
 *
 * 数据来源已改为 GET /irs/underlying-monitors（今日待办下线），pp/pv 由调用方
 * types.toSubjectRow 归一化成短键映射；口径仍是后端的 zone/pv（🔒4.13），
 * 本组件只做几何与交互，不做任何口径换算。
 * 数据无效（任一档为空 / 五档非严格递增 / 无现价）由父组件判断，回退降级滑块。
 */
import { computed, ref } from 'vue';
import { TIER_BANDS, TIER_NAMES, type TierBand, type TierMap } from './types';

const props = defineProps<{
  /** 五档价；由调用方 Number 化后传入，任一为空即不渲染（父级已判） */
  pp: TierMap | null;
  /** 距各档 %（负 = 档位在现价下方） */
  pv: TierMap | null;
  /** 现价 */
  price: number | null;
  /** 假设价：叠加第二游标，与现价游标同轴；空/未传不渲染 */
  hypoPrice?: number | null;
}>();

/** 定位结果：假设价（精确数值）。回现价由卡片读数行的按钮负责，不经本组件 */
const emit = defineEmits<{ pick: [number] }>();

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

/** 轴域：把现价纳入 [lo, hi]，游标永远在轴内；不留 padding（2026-11-15 用户确认） */
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

// ---------------- 色带交互：档位条即滑块（2026-11-15） ----------------

/** 步长按量纲（原 index.vue stepOf 下沉到此处，保证吸附网格与轴域同源） */
const step = computed(() => {
  const a = axis.value;
  if (!a) return 1;
  const span = a.hi - a.lo;
  if (span > 500) return 1;
  if (span > 50) return 0.1;
  return 0.01;
});

/** 可交互条件：轴有效 + 有正现价（父级已判五档齐全，这里再兜一层） */
const interactive = computed(() => {
  const a = axis.value;
  return a !== null && a.hi > a.lo && (priceVal.value ?? 0) > 0;
});

/** 命中层：视觉上仍只有 14px 色带，向上扩 7px、向下只扩 2px（不侵占下方标签热区） */
const bandRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
/** hover 预览价：未按下时显示气泡与幽灵游标；拖动中靠假设价圆点反馈 */
const hoverPrice = ref<number | null>(null);
const hoverPct = computed(() => (hoverPrice.value == null ? null : toPct(hoverPrice.value)));

/** 假设价与某档精确相等时高亮该列（点击档位定位的视觉回执） */
const pickedIdx = computed(() => {
  const h = props.hypoPrice;
  if (h == null) return -1;
  return (ppVals.value as (number | null)[]).findIndex(v => v != null && Math.abs(Number(v) - Number(h)) < 1e-9);
});

/**
 * 指针 → 价格：轴内线性反算 → 档位磁性吸附 → step 网格吸附。
 * 磁性吸附保证「点完档再轻拖」仍停在精确档位价上（档位价不一定落在 step 网格里）；
 * 阈值取 step/2 与 5px 对应价格二者的较大值，宽轴与窄轴手感一致。
 */
function priceFromEvent(e: Event): number | null {
  const pe = e as PointerEvent;
  const el = bandRef.value;
  const a = axis.value;
  if (!el || !a || !interactive.value) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (pe.clientX - rect.left) / rect.width));
  const raw = a.lo + ratio * (a.hi - a.lo);
  const magnet = Math.max(step.value / 2, ((a.hi - a.lo) / rect.width) * 5);
  let nearest: number | null = null;
  let dist = Infinity;
  // 候选含五档 + 现价：点现价三角附近会精确回到现价，setHypo 随即清掉 override（等价回现价）
  const candidates: (number | null)[] = [...(ppVals.value as (number | null)[]), priceVal.value];
  for (const v of candidates) {
    if (v == null) continue;
    const d = Math.abs(raw - Number(v));
    if (d < dist) {
      dist = d;
      nearest = Number(v);
    }
  }
  if (nearest != null && dist <= magnet) return nearest;
  // 网格从轴左端起算（与 NSlider 的 min + n×step 同口径），再钳进轴域
  const s = step.value;
  const snapped = a.lo + Math.round((raw - a.lo) / s) * s;
  const clamped = Math.min(a.hi, Math.max(a.lo, snapped));
  return Number(clamped.toFixed(4));
}

function onPointerDown(e: Event) {
  if (!interactive.value) return;
  const pe = e as PointerEvent;
  pe.preventDefault();
  dragging.value = true;
  const el = e.currentTarget as HTMLElement | null;
  el?.setPointerCapture?.(pe.pointerId);
  const v = priceFromEvent(e);
  if (v != null) emit('pick', v);
}

function onPointerMove(e: Event) {
  if (!interactive.value) return;
  if (dragging.value) {
    const v = priceFromEvent(e);
    if (v != null) emit('pick', v);
    return;
  }
  hoverPrice.value = priceFromEvent(e);
}

function onPointerUp(e: Event) {
  if (!dragging.value) return;
  dragging.value = false;
  const pe = e as PointerEvent;
  const el = e.currentTarget as HTMLElement | null;
  if (el?.hasPointerCapture?.(pe.pointerId)) el.releasePointerCapture(pe.pointerId);
  hoverPrice.value = null;
}

function onPointerCancel(e: Event) {
  onPointerUp(e);
  dragging.value = false;
  hoverPrice.value = null;
}

function onPointerLeave() {
  if (!dragging.value) hoverPrice.value = null;
}

/** 点击档位标签：假设价 = 该档精确价（不吸附 step） */
function pickTier(i: number) {
  if (!interactive.value) return;
  const v = ppVals.value[i];
  if (v == null) return;
  hoverPrice.value = null;
  emit('pick', Number(v));
}

// ---------------- 标签布局：三行锁死同一 y，合成一个可点列 ----------------

/** 档名 / 档位价 / 距档% 三行的固定行高（18+16+16 = 50px 标签区总高） */
const LABELS_H = 50;

/** 列定位：按刻度百分比居中，三行在列内流式排布、不再各自绝对定位 */
function labelColStyle(i: number) {
  const t = tickPcts.value;
  if (!t) return {};
  return { left: `${t[i]}%`, transform: 'translateX(-50%)' };
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
    <!-- 渐变色带：停靠点在各档实际位置；整条即定位轴 -->
    <div class="relative h-14px">
      <div class="h-full rounded-4px" :style="{ background: gradientCss }" />
      <!-- 五档刻度细线（真实位置） -->
      <div
        v-for="(t, i) in tickPcts"
        :key="`tick-${i}`"
        class="absolute top-0 h-full w-1px"
        :style="{ left: `${t}%`, background: 'rgba(255,255,255,0.65)' }"
      />
      <!-- hover 幽灵游标（未拖动时的价格预览） -->
      <div
        v-if="hoverPct !== null"
        class="pointer-events-none absolute top-0 h-full w-1px opacity-50"
        :style="{ left: `${hoverPct}%`, background: 'currentColor' }"
      />
      <!-- 当前价游标：细线贯穿色带 + 上方倒三角（真实位置；只作视觉，不是回现价热区） -->
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
      <!-- 假设价游标：圆形点（可抓握把手；定位后与色带同点反馈） -->
      <template v-if="hypoPct !== null">
        <div
          class="pointer-events-none absolute top-1px h-12px w-12px rounded-full border-2px border-white bg-green-500"
          :style="{ left: `${hypoPct}%`, transform: 'translateX(-50%)' }"
        />
      </template>
      <!-- hover 价格气泡：拖动时让位给假设价圆点与读数行 -->
      <div
        v-if="hoverPrice !== null && hoverPct !== null"
        class="pointer-events-none absolute rounded-4px bg-gray-700 px-4px py-1px text-11px text-white"
        :style="{ left: `${hoverPct}%`, top: '-24px', transform: 'translateX(-50%)', zIndex: 3 }"
      >
        {{ fmtPrice(hoverPrice) }}
      </div>
      <!-- 超界提示：hover 预览时暂时让位，避免与气泡叠字 -->
      <div
        v-if="overRange && hoverPrice === null"
        class="pointer-events-none absolute -top-20px text-12px text-red-500"
        :style="overRange.side === 'high' ? { right: 0 } : { left: 0 }"
      >
        {{ overRange.side === 'high' ? '超出极高' : '低于极低' }} {{ fmtPv(overRange.pct) }}
      </div>
      <!--
        定位命中层：透明、不占布局高度。向下只扩 2px（色带与标签区间有 4px 空隙），
        绝不覆盖下方标签的第一行，避免「点档名上半部变成拖色带」。
      -->
      <div
        v-if="interactive"
        ref="bandRef"
        class="absolute left-0 right-0"
        style="top: -7px; bottom: -2px; z-index: 2; touch-action: none; cursor: ew-resize"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @pointerleave="onPointerLeave"
      />
    </div>

    <!-- 五档标签：每档一个可点列，档名 / 档位价 / 距档% 三行锁死同一水平 -->
    <div class="relative mt-4px" :style="{ height: `${LABELS_H}px` }">
      <div
        v-for="(t, i) in TIERS"
        :key="`tier-${t.band}`"
        class="tier-pick absolute top-0 whitespace-nowrap text-center"
        :class="[pickedIdx === i ? 'is-picked' : '', interactive ? '' : 'is-static']"
        :style="labelColStyle(i)"
        :title="`点击设为「${t.name}」档：${fmtPrice(ppVals[i])}（距该档 ${fmtPv(pvVals[i])}）`"
        @click="pickTier(i)"
      >
        <div
          class="text-12px"
          :class="[
            i === zoneIdx ? 'font-600' : '',
            t.tone === 'low' ? 'text-green-600' : t.tone === 'high' ? 'text-red-500' : 'text-amber-500'
          ]"
          style="height: 18px; line-height: 16px"
        >
          {{ t.name }}
        </div>
        <div class="text-11px text-gray-400" style="height: 16px; line-height: 16px">
          {{ fmtPrice(ppVals[i]) }}
        </div>
        <div class="text-11px text-gray-400" style="height: 16px; line-height: 16px">
          {{ fmtPv(pvVals[i]) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 可点标签列：hover 抬升 z-index，解决档位挤在一起时叠字互相盖住热区的问题；
 * 半透明灰 / 绿在明暗主题下都可读，不引 UnoCSS 的 dark: 变体。
 */
.tier-pick {
  cursor: pointer;
  padding: 0 2px;
  border-radius: 4px;
}
.tier-pick:hover {
  z-index: 5;
  background: rgba(128, 128, 128, 0.14);
}
.tier-pick.is-picked {
  background: rgba(93, 202, 165, 0.22);
  box-shadow: inset 0 0 0 1px rgba(15, 110, 86, 0.45);
}
.tier-pick.is-static {
  cursor: default;
}
.tier-pick.is-static:hover {
  background: transparent;
}
</style>
