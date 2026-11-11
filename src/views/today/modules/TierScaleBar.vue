<script setup lang="ts">
/**
 * 档位刻度条（今日页标的卡片专用，GET /irs/today 的 pp/pv 透传字段）
 *
 * 真实价格轴：刻度按档位实际价格定位（不再均分），轴域 = [min(极低,现价), max(极高,现价)]，
 * 现价纳入轴域 ⇒ 游标永远在轴内真实位置，无需钳制；现价超界时五档整体内收
 * （跌破整个档位体系一眼可见），并保留「超出极高/低于极低 X%」红字提示。
 *
 * 渐变色带：绿（极低）→ 琥珀（中）→ 红（极高），渐变停靠点跟随各档实际位置，
 * 颜色与价格语义对齐。低=便宜=绿，高=贵=红。
 *
 * 数字全部直接展示后端透传值：每档下方 = 档位价格（pp_*）+ 距该档 %（pv_*，
 * 负 = 档位在现价下方）。不展示「现价 X · 位于低~中」这类冗余文字。
 * 档位挤在一起时标签自动两行交错（按容器实测宽度贪心分行），首尾标签收进容器防出界。
 *
 * 纯几何渲染，口径仍是后端的 zone/pv（铁律 4.5）；数据无效（任一档为空 / 五档
 * 非严格递增 / 无现价）由父组件判断，回退旧文案。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{
  item: Api.Irs.TodayItem;
  /** 假设价（推演工作台滑块）：叠加第二游标，与现价游标同轴；空/未传不渲染 */
  hypoPrice?: number | null;
}>();

/** 五档刻度定义 */
const TIERS = [
  { pp: 'pp_el', pv: 'pv_el', name: '极低', tone: 'low' },
  { pp: 'pp_l', pv: 'pv_l', name: '低', tone: 'low' },
  { pp: 'pp_m', pv: 'pv_m', name: '中', tone: 'mid' },
  { pp: 'pp_h', pv: 'pv_h', name: '高', tone: 'high' },
  { pp: 'pp_eh', pv: 'pv_eh', name: '极高', tone: 'high' }
] as const;

/** 渐变停靠色（随各档实际位置布点，绿→琥珀→红） */
const TIER_COLORS = ['#0F6E56', '#5DCAA5', '#EF9F27', '#F0997B', '#D85A30'];

/** 标签行高 / 盒间最小间隙（防叠字）。盒宽不设常数：按各标签实际字符串估宽
 *  （64px 统一盒比真实文字宽 ~20px，会把「横向明明放得下」的刻度误判重叠踢到第二行，
 *  如 600036 的中刻度） */
const ROW_H = 18;
const BOX_GAP = 4;

function num(v: number | null | undefined) {
  return v == null ? null : Number(v);
}

const ppVals = computed(() => TIERS.map(t => num(props.item.pp?.[t.pp])));
const pvVals = computed(() => TIERS.map(t => num(props.item.pv?.[t.pv])));
const priceVal = computed(() => num(props.item.price));

/** 估算标签渲染宽度：CJK 12px/字，数字与符号约 6.6px/字（11~12px 字号），+8px 余量 */
function estLabelWidth(name: string, priceStr: string, pvStr: string) {
  const w = (s: string) => [...s].reduce((a, ch) => a + (/[\u4e00-\u9fff]/.test(ch) ? 12 : 6.6), 0);
  return Math.max(w(name), w(priceStr), w(pvStr)) + 8;
}

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

// ---------------- 标签防重叠：实测容器宽 → 盒钳制 → 两行贪心 ----------------

const barRef = ref<HTMLElement | null>(null);
const barWidth = ref(0);
let resizeObs: ResizeObserver | null = null;

onMounted(() => {
  if (!barRef.value) return;
  resizeObs = new ResizeObserver(entries => {
    barWidth.value = entries[0]?.contentRect.width ?? 0;
  });
  resizeObs.observe(barRef.value);
});
onUnmounted(() => {
  resizeObs?.disconnect();
  resizeObs = null;
});

/** 各档标签估宽（随档位价/距档%字符串长度变化） */
const labelWs = computed(() =>
  TIERS.map((t, i) => estLabelWidth(t.name, fmtPrice(ppVals.value[i]), fmtPv(pvVals.value[i])))
);

/** 每档标签盒（px）：一律以刻度为中心（首尾不钳制，允许伸进卡片内边距，
 *  与其他刻度标签对齐方式一致）；盒宽按各自字符串估宽 */
const labelBoxes = computed(() => {
  const t = tickPcts.value;
  if (!t || barWidth.value <= 0) return null;
  const w = barWidth.value;
  return t.map((p, i) => {
    const cx = (p / 100) * w;
    const hw = labelWs.value[i] / 2;
    return { left: cx - hw, right: cx + hw };
  });
});

/** 两行交错贪心：上一行放不下放下一行，两行都放不下挑剩余空间大的一行 */
const labelRows = computed(() => {
  const boxes = labelBoxes.value;
  if (!boxes) return [0, 0, 0, 0, 0];
  const rowRight: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  return boxes.map(b => {
    let r: number;
    if (rowRight[0] + BOX_GAP <= b.left) r = 0;
    else if (rowRight[1] + BOX_GAP <= b.left) r = 1;
    else r = rowRight[0] <= rowRight[1] ? 0 : 1;
    rowRight[r] = b.right;
    return r;
  });
});

const labelsHeight = computed(() => `${labelRows.value.some(r => r === 1) ? 64 : 46}px`);

/** 标签定位：宽度未知时按百分比居中（单行）；已知后按实测盒左缘定位（可交错） */
function labelStyle(i: number) {
  const t = tickPcts.value;
  if (!t) return { width: `${labelWs.value[i]}px` };
  const boxes = labelBoxes.value;
  if (!boxes) return { left: `${t[i]}%`, transform: 'translateX(-50%)', top: '0px', width: `${labelWs.value[i]}px` };
  return {
    left: `${boxes[i].left}px`,
    top: `${labelRows.value[i] * ROW_H}px`,
    width: `${labelWs.value[i]}px`
  };
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
  <div ref="barRef" class="mx-14px select-none">
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
      <!-- 假设价游标：圆形点（推演工作台滑块联动） -->
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

    <!-- 五档刻度数字：档名 + 档位价 + 距该档 %（挤在一起时自动两行交错） -->
    <div class="relative mt-4px" :style="{ height: labelsHeight }">
      <div
        v-for="(t, i) in TIERS"
        :key="t.pp"
        class="absolute text-center"
        :style="labelStyle(i)"
        :title="`${t.name}：档位价 ${fmtPrice(ppVals[i])}，距该档 ${fmtPv(pvVals[i])}`"
      >
        <div
          class="text-12px"
          :class="[
            i === zoneIdx ? 'font-600' : '',
            t.tone === 'low' ? 'text-green-600' : t.tone === 'high' ? 'text-red-500' : 'text-amber-500'
          ]"
        >
          {{ t.name }}
        </div>
        <div class="text-11px text-gray-400">{{ fmtPrice(ppVals[i]) }}</div>
        <div class="text-11px text-gray-400">{{ fmtPv(pvVals[i]) }}</div>
      </div>
    </div>
  </div>
</template>
