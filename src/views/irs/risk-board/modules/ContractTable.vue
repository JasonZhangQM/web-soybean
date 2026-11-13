<script setup lang="ts">
/**
 * 逐仓总表（/irs/simulate 右栏 ③，2026-11-13 合并「逐张合约」+「逐仓明细」）
 *
 * 两路数据按 (账户 + 合约) join，行集实测一一对应（10↔10、键无重复无孤儿、pf_now 零差异）：
 * - board.positions（GET /irs/risk-board）：合约静态列，只在首屏 / IV / 行情更新时变；
 * - sim.position_rows（POST /irs/simulate）：当前假设价的到档列，每次滑块 debounce 重算。
 * 两组列用两级分组表头隔开，避免把「当前保证金」与「到档保证金」读成同一个数。
 *
 * 口径全部后端算（🔒4.13）：前端只做 join / 排序 / 展示，不推算任何风险指标。
 * 版式与 ① 账户总表 / ② 档位压力表同构：父页 SectionBar 分节，本组件不套 NCard，
 * 只给一行口径说明 + 裸 NDataTable，表内不设 max-height（右栏整体滚动）。
 * NDataTable 不写 size（🔒4.7）；scroll-x 按叶子列宽和自动求和（🔒4.11）；
 * th/td 不折行必须写 :deep()（scoped 属性加不到子组件渲染的单元格上）。
 */
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { deltaPnlHeader, fmtMoney, fmtPrice, pnl } from './utils';

defineOptions({ name: 'ContractTable' });

const props = defineProps<{
  /** 风险看板静态卡：合约静态列 + 账户清单 */
  board: Api.Irs.RiskBoard;
  /** 当前账户视角：ALL 或具体账户 */
  account: string;
  /** 当前滑块假设价的推演结果：到档列唯一数据源 */
  sim: Api.Irs.SimulateResult;
  /** 当前假设档位中文名，用于表头注记 */
  levelLabel?: string;
}>();

/** 静态列 + 到档列合并后的行；join 未命中的合约到档字段为 null，显示 '-'、不伪造 0 */
interface MergedPosition extends Api.Irs.RiskBoardPosition {
  subject: string | null;
  subject_name: string | null;
  risk_exposure: number | null;
  price_now: number | null;
  price_at: number | null;
  changed: boolean;
  delta_pnl_now: number | null;
  delta_pnl_expiry: number | null;
  margin_at: number | null;
  margin_delta: number | null;
}

const router = useRouter();

/** 逐仓粒度 Δ 盈亏列头口径（自 index.vue 迁入）；与档位 Tab 的「只统计该标的项下持仓」不同，勿照抄 */
const SIM_POS_DELTA_SCOPE =
  '两列都是相对当前的 Δ（V(S1)−V(S0)），逐仓按该合约重估值统计。即期：改价未命中的持仓价格冻结、Δ 恒 0；到期：所有期权（含冻结行）时间价值归零，Δ 也含这部分 ⇒ 只有 Σ即期Δ 可与组合 Δ盈亏对账。证券/期货两列恒等，差异只来自期权；与「当前盈亏」账面口径基准不同，不可相加对账。';

function exposureOfRow(r: MergedPosition) {
  return Number(r.risk_exposure ?? 0);
}

function tailOrder(a: MergedPosition, b: MergedPosition) {
  return (
    String(a.acct ?? '').localeCompare(String(b.acct ?? '')) ||
    String(a.symbol ?? '').localeCompare(String(b.symbol ?? '')) ||
    Number(a.strike ?? 0) - Number(b.strike ?? 0)
  );
}

/**
 * 排序与原「逐仓明细」逐字一致：标的项下敞口合计倒序 → 同标的聚拢（名称 / 代码）→
 * 组内逐仓敞口倒序 → 未归属固定排最后 → 账户 / 合约 / 行权价兜底稳定。
 * 账户视角过滤沿用「逐张合约」：ALL 展示全部，否则只留该账户持仓。
 */
const rows = computed<MergedPosition[]>(() => {
  const simMap = new Map<string, Api.Irs.SimulatePositionRow>();
  for (const r of props.sim.position_rows ?? []) simMap.set(`${r.acct}-${r.name}`, r);
  const exp = props.sim.subject_exposure ?? {};
  const merged: MergedPosition[] = (props.board.positions ?? [])
    .filter(p => props.account === 'ALL' || p.acct === props.account)
    .map(p => {
      const s = simMap.get(`${p.acct}-${p.symbol}`);
      return {
        ...p,
        subject: s?.subject ?? null,
        subject_name: s?.subject_name ?? null,
        risk_exposure: s?.risk_exposure ?? null,
        price_now: s?.price_now ?? null,
        price_at: s?.price_at ?? null,
        changed: s?.changed ?? false,
        delta_pnl_now: s?.delta_pnl_now ?? null,
        delta_pnl_expiry: s?.delta_pnl_expiry ?? null,
        margin_at: s?.margin_at ?? null,
        margin_delta: s?.margin_delta ?? null
      };
    });
  return merged.sort((a, b) => {
    if (!a.subject || !b.subject) {
      if (a.subject !== b.subject) return a.subject ? -1 : 1;
      return exposureOfRow(b) - exposureOfRow(a) || tailOrder(a, b);
    }
    return (
      (exp[b.subject] ?? 0) - (exp[a.subject] ?? 0) ||
      String(b.subject_name ?? b.subject).localeCompare(String(a.subject_name ?? a.subject), 'zh-Hans-CN') ||
      b.subject.localeCompare(a.subject) ||
      exposureOfRow(b) - exposureOfRow(a) ||
      tailOrder(a, b)
    );
  });
});

/** 品种标签：期货 / 认购 / 认沽 / 其他 */
function kindLabel(p: MergedPosition): string {
  if (p.kind === 'fut') return '期货';
  if (p.kind === 'call') return '认购';
  if (p.kind === 'put') return '认沽';
  return '其他';
}

/** 方向：期权用多/空，期货用数量正负（合并「逐仓明细」的多空口径，避免期货显示 '—'） */
function sideTag(p: MergedPosition) {
  let isLong: boolean | null = null;
  if (p.side) isLong = p.side === 'long';
  else if (p.qty != null) isLong = Number(p.qty) > 0;
  if (isLong === null) return h('span', {}, '—');
  return h(NTag, { size: 'small', type: isLong ? 'success' : 'warning' }, { default: () => (isLong ? '多' : '空') });
}

/** C/P 徽标 */
function cpTag(p: MergedPosition) {
  if (!p.cp) return h('span', {}, '—');
  return h(NTag, { size: 'small', type: p.cp === 'C' ? 'error' : 'info' }, { default: () => p.cp });
}

/** 最大亏损：null（卖认购）= 理论无上限，红字并注明是数学上界 */
function renderMaxLoss(p: MergedPosition) {
  if (p.max_loss === null) {
    return h('span', { style: 'color: #d03050; font-weight: 600' }, '无上限');
  }
  return fmtMoney(p.max_loss);
}

/** 保证金效率 = |delta × 名义市值| ÷ 当前保证金；每 1 元保证金换来多少方向敞口，越低越该先平 */
function renderEfficiency(p: MergedPosition) {
  if (!p.margin_now || p.delta === null) return '—';
  const v = (Math.abs(p.delta) * p.nominal) / p.margin_now;
  return h('span', { style: v < 1 ? 'color: #d03050; font-weight: 600' : '' }, v.toFixed(2));
}

/** 保证金变化：占用增加染红、减少染绿，显示带符号原值（不取相反数） */
function marginDelta(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return h('span', { style: { color: n > 0 ? '#d03050' : '#18a058' } }, `${n > 0 ? '+' : ''}${fmtMoney(n)}`);
}

/**
 * 两级分组表头：静态组（board，不随滑块变）/ 到档组（sim，每次改价重算）。
 * 原「逐张合约」15 个静态列全保留 + 两列 Δ 改归到档组，并入「逐仓明细」的标的 /
 * 风险敞口 / 基准价→情景价 / 到档保证金 / 保证金变化；两边都有的张数、行权价、方向、当前盈亏各留一份。
 */
const columns = computed<DataTableColumns<MergedPosition>>(() => [
  {
    title: '合约与静态（不随滑块变）',
    key: 'g_static',
    children: [
      {
        title: '合约',
        key: 'symbol',
        width: 175,
        render: (p: MergedPosition) =>
          h(
            'span',
            {
              style: 'color: #2080f0; cursor: pointer',
              title: '去期权行情页同步/查看该合约行情',
              onClick: goOptionQuote
            },
            p.symbol
          )
      },
      { title: '账户', key: 'acct', width: 90 },
      { title: '品种', key: 'kind', width: 80, render: (p: MergedPosition) => kindLabel(p) },
      { title: '方向', key: 'side', width: 70, render: (p: MergedPosition) => sideTag(p) },
      { title: 'C/P', key: 'cp', width: 60, render: (p: MergedPosition) => cpTag(p) },
      { title: '张数', key: 'qty', width: 80, align: 'right' as const },
      {
        title: '行权价',
        key: 'strike',
        width: 90,
        align: 'right' as const,
        render: (p: MergedPosition) => (p.strike === null ? '—' : fmtPrice(p.strike))
      },
      {
        title: '到期天数',
        key: 'days',
        width: 90,
        align: 'right' as const,
        render: (p: MergedPosition) => (p.days === null ? '—' : String(p.days))
      },
      {
        title: 'IV',
        key: 'sigma',
        width: 80,
        align: 'right' as const,
        render: (p: MergedPosition) => (p.sigma === null ? '—' : `${(p.sigma * 100).toFixed(2)}%`)
      },
      {
        title: 'delta',
        key: 'delta',
        width: 80,
        align: 'right' as const,
        render: (p: MergedPosition) => (p.delta === null ? '—' : p.delta.toFixed(3))
      },
      {
        title: '盯市单价',
        key: 'px',
        width: 100,
        align: 'right' as const,
        render: (p: MergedPosition) => (p.px === null ? '—' : fmtPrice(p.px))
      },
      {
        title: '当前保证金',
        key: 'margin_now',
        width: 110,
        align: 'right' as const,
        render: (p: MergedPosition) => fmtMoney(p.margin_now)
      },
      {
        title: '当前盈亏',
        key: 'pf_now',
        width: 120,
        align: 'right' as const,
        render: (p: MergedPosition) => pnl(p.pf_now)
      },
      {
        title: '最大亏损',
        key: 'max_loss',
        width: 110,
        align: 'right' as const,
        render: (p: MergedPosition) => renderMaxLoss(p)
      },
      {
        title: '保证金效率',
        key: 'margin_eff',
        width: 110,
        align: 'right' as const,
        render: (p: MergedPosition) => renderEfficiency(p)
      }
    ]
  },
  {
    title: '当前假设 · 到档（随滑块变）',
    key: 'g_sim',
    children: [
      {
        title: '标的',
        key: 'subject',
        width: 100,
        render: (r: MergedPosition) => r.subject_name || r.subject || '—'
      },
      {
        title: '风险敞口',
        key: 'risk_exposure',
        width: 100,
        align: 'right' as const,
        render: (r: MergedPosition) => fmtMoney(r.risk_exposure)
      },
      {
        title: '基准价→情景价',
        key: 'price',
        width: 150,
        align: 'right' as const,
        render: (r: MergedPosition) => `${fmtPrice(r.price_now)}→${fmtPrice(r.price_at)}`
      },
      {
        title: deltaPnlHeader('即期', SIM_POS_DELTA_SCOPE),
        key: 'delta_pnl_now',
        width: 130,
        align: 'right' as const,
        render: (r: MergedPosition) => pnl(r.delta_pnl_now)
      },
      {
        title: deltaPnlHeader('到期', SIM_POS_DELTA_SCOPE),
        key: 'delta_pnl_expiry',
        width: 130,
        align: 'right' as const,
        render: (r: MergedPosition) => pnl(r.delta_pnl_expiry)
      },
      {
        title: '到档保证金',
        key: 'margin_at',
        width: 110,
        align: 'right' as const,
        render: (r: MergedPosition) => fmtMoney(r.margin_at)
      },
      {
        title: '保证金变化',
        key: 'margin_delta',
        width: 110,
        align: 'right' as const,
        render: (r: MergedPosition) => marginDelta(r.margin_delta)
      }
    ]
  }
]);

/** scroll-x = 叶子列宽和：分组表头父列不设 width，递归求和（🔒4.11） */
type WidthCol = { width?: number; children?: WidthCol[] };
function sumWidth(cols: WidthCol[]): number {
  return cols.reduce((s, c) => s + (c.children ? sumWidth(c.children) : Number(c.width ?? 0)), 0);
}
const scrollX = computed(() => sumWidth(columns.value as unknown as WidthCol[]));

function rowKey(p: MergedPosition) {
  return `${p.acct}-${p.symbol}`;
}

/** 改价命中行高亮（与原逐仓明细一致） */
function rowProps(r: MergedPosition) {
  return { style: r.changed ? 'background: rgba(93,202,165,0.08);' : '' };
}

function goOptionQuote() {
  router.push({ name: 'irs_option-quote' });
}
</script>

<template>
  <!--
    与 ① 账户总表 / ② 档位压力表同构：父页用 SectionBar 分节，这里不套 NCard，
    只保留一行口径说明 + 裸 NDataTable；单根元素让父页传的 class（mb-16px）正常生效。
  -->
  <div>
    <div class="mb-6px text-11px text-gray-400">
      共 {{ rows.length }} 仓 · 当前假设：{{ levelLabel || '现价' }}（点击档位压力表切换）。
      静态组取风险看板（不随滑块变）、到档组取当前推演（每次改价重算），两组保证金时点不同，不可相加对账；
      「无上限」为数学上界，非风险预算。点击合约名跳期权行情。
    </div>
    <NDataTable
      :columns="columns"
      :data="rows"
      :pagination="false"
      :bordered="false"
      :row-key="rowKey"
      :row-props="rowProps"
      :scroll-x="scrollX"
    />
  </div>
</template>

<style scoped>
/*
 * 单元格一律不折行：合约名（CFFEX.IO2611-P-4000）在窄列里会断成两行，把行高撑成两倍。
 * :deep() 是必须的——th/td 由 NDataTable 子组件渲染，scoped 属性加不到它们身上。
 * 行高 / 字号 / 明暗主题全部沿用全局 NDataTable 主题，不另写 padding 或卡片样式，
 * 与 ① 账户总表、② 档位压力表保持同一套；分组表头下不开 virtual-scroll。
 */
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
