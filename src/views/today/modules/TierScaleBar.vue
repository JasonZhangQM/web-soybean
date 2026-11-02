<script setup lang="ts">
/**
 * 档位刻度条（今日页标的卡片专用，GET /irs/today 的 pp/pv 透传字段）
 *
 * 等宽四段色带：极低→低→中→高→极高；低=便宜=绿，高=贵=红。
 * 当前价在相邻两档之间线性插值定位（纯几何渲染，口径仍是后端的 zone/pv，
 * 铁律 4.5：前端不重算估值）；超出 [pp_el, pp_eh] 时钳制在端点并标提示。
 *
 * 数字全部直接展示后端透传值：每档下方 = 档位价格（pp_*）+ 距该档 %（pv_*，
 * 负 = 档位在现价下方）。不展示「现价 X · 位于低~中」这类冗余文字。
 *
 * 数据无效（任一档为空 / 五档非严格递增 / 无现价）由父组件判断，回退旧文案。
 */
import { computed } from 'vue';

const props = defineProps<{ item: Api.Irs.TodayItem }>();

/** 五档刻度定义：色带分段色（低侧绿、高侧红，明暗主题下均可读的中调色） */
const TIERS = [
  { pp: 'pp_el', pv: 'pv_el', name: '极低', tone: 'low' },
  { pp: 'pp_l', pv: 'pv_l', name: '低', tone: 'low' },
  { pp: 'pp_m', pv: 'pv_m', name: '中', tone: 'mid' },
  { pp: 'pp_h', pv: 'pv_h', name: '高', tone: 'high' },
  { pp: 'pp_eh', pv: 'pv_eh', name: '极高', tone: 'high' }
] as const;

/** 四段色带（相邻两刻度之间） */
const SEG_COLORS = ['#0F6E56', '#5DCAA5', '#F0997B', '#D85A30'];

const ppVals = computed(() => TIERS.map(t => num(props.item.pp?.[t.pp])));
const pvVals = computed(() => TIERS.map(t => num(props.item.pv?.[t.pv])));

function num(v: number | null | undefined) {
  return v == null ? null : Number(v);
}

/** 当前价 → 条上的百分比位置（0~100，等宽四段内插值；超界钳制） */
const markerPct = computed(() => {
  const price = num(props.item.price);
  const pp = ppVals.value;
  if (price == null || pp.some(v => v == null)) return null;
  const p = pp as number[];
  if (price <= p[0]) return 0;
  if (price >= p[4]) return 100;
  for (let i = 0; i < 4; i += 1) {
    if (price <= p[i + 1]) {
      const frac = (price - p[i]) / (p[i + 1] - p[i]);
      return ((i + frac) / 4) * 100;
    }
  }
  return 100;
});

/** 超界方向与幅度 %（只做展示性减法，不算口径） */
const overRange = computed(() => {
  const price = num(props.item.price);
  const pp = ppVals.value;
  if (price == null || pp.some(v => v == null)) return null;
  const p = pp as number[];
  if (price > p[4]) return { side: 'high' as const, pct: (price / p[4] - 1) * 100 };
  if (price < p[0]) return { side: 'low' as const, pct: (p[0] / price - 1) * 100 };
  return null;
});

/** 当前所在区间名（用于刻度名高亮） */
const zoneIdx = computed(() => {
  const price = num(props.item.price);
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
    <!-- 色带：四段等宽 -->
    <div class="relative h-14px">
      <div class="flex h-full overflow-hidden rounded-4px">
        <div v-for="(c, i) in SEG_COLORS" :key="i" class="h-full flex-1" :style="{ background: c }" />
      </div>
      <!-- 段间刻度分隔线（25/50/75%） -->
      <div
        v-for="i in 3"
        :key="`tick-${i}`"
        class="absolute top-0 h-full w-1px"
        :style="{ left: `${i * 25}%`, background: 'rgba(255,255,255,0.55)' }"
      />
      <!-- 当前价游标：细线贯穿色带 + 上方倒三角 -->
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
      <!-- 超界提示 -->
      <div
        v-if="overRange"
        class="absolute -top-20px text-12px text-red-500"
        :style="overRange.side === 'high' ? { right: 0 } : { left: 0 }"
      >
        {{ overRange.side === 'high' ? '超出极高' : '低于极低' }} {{ fmtPv(overRange.pct) }}
      </div>
    </div>

    <!-- 五档刻度数字：档名 + 档位价 + 距该档 % -->
    <div class="relative mt-4px h-40px">
      <div
        v-for="(t, i) in TIERS"
        :key="t.pp"
        class="absolute w-64px text-center"
        :style="{ left: `${i * 25}%`, transform: 'translateX(-50%)' }"
        :title="`${t.name}：档位价 ${fmtPrice(ppVals[i])}，距该档 ${fmtPv(pvVals[i])}`"
      >
        <div
          class="text-12px"
          :class="[
            i === zoneIdx ? 'font-600' : '',
            t.tone === 'low' ? 'text-green-600' : t.tone === 'high' ? 'text-red-500' : 'text-gray-500'
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
