<script setup lang="ts">
/**
 * 档位压力表（/irs/simulate 右栏第二块，2026-11-13 由 /irs/risk-board 情景压力表迁移改造）
 *
 * 与原压力表的根本差别：行不再是「全组同跌 X%」11 档，而是**全部监测标的同步到
 * 同一档**的五个档位（极低/低/中/高/极高）+ 一行现价基准。每个标的用自己的 pp_*
 * 档位价，故各标的到档幅度不同 —— 「到档幅度」列给的是区间，不是单一涨跌幅。
 *
 * 点击整行 = 选中档位；由父页同步批量套用左栏滑块（所见即所得），逐张合约 /
 * 保证金结构图的 Δ 盈亏随之联动。组合与账户指标全部后端现算，前端只切视角、
 * 不做任何自算（🔒4.13）。
 *
 * NDataTable 不写 size（🔒4.7）；scroll-x 由列宽和求出（🔒4.11）；
 * th/td 不折行必须写 :deep()（scoped 属性加不到子组件渲染的单元格上）。
 */
import { computed, h } from 'vue';
import { NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { fmtMoney, fmtRatio, levelColor, pnl, ratioLevel } from '@/views/irs/risk-board/modules/utils';

defineOptions({ name: 'LevelPressureTable' });

const props = defineProps<{
  /** 五档档位压力结果（POST /irs/simulate/levels） */
  levels: Api.Irs.SimulateLevelsResult;
  /** 风险看板静态卡：账户当前盈亏、账户清单 */
  board: Api.Irs.RiskBoard;
  /** 当前账户视角：ALL = 组合 */
  account: string;
  /** 当前选中档位：'base' = 现价基准，其余为 el/l/m/h/eh */
  activeLevel: string;
}>();

const emit = defineEmits<{ select: [key: string] }>();

interface Row {
  key: string;
  label: string;
  /** 该档实际生效标的数；现价基准行为 null */
  subjectCount: number | null;
  pctMin: number | null;
  pctMax: number | null;
  /** 账面浮盈，六行恒定（静态口径） */
  pfNow: number;
  /** 该档相对当前的 Δ 盈亏（正=盈） */
  deltaPnl: number;
  net: number;
  margin: number;
  real: number | null;
  exch: number | null;
  breached: boolean;
}

interface Src {
  combo: Api.Irs.SimulateCombo;
  accounts: Api.Irs.SimulateAccount[];
  /** 正=亏；单账户视角不用它，直接取该账户的 delta_pnl */
  deltaLoss: number;
}

/** 账户层静态账面浮盈：ALL 取组合合计，其余取账户卡（与旧压力表同源） */
const pfNow = computed(() =>
  props.account === 'ALL' ? props.board.pf_now_total : (props.board.accounts[props.account]?.pf_now ?? 0)
);

/**
 * 按账户视角取该档的六项读数。
 * - ALL：组合层 combo（Σ÷Σ，不是各账户比率平均），追保 = 任一账户越线；
 * - 单账户：取该账户卡；账户不存在（空账户未展示）时全给 0/null，不伪造数。
 */
function makeRow(
  key: string,
  label: string,
  src: Src,
  ext: { subjectCount: number | null; pctMin: number | null; pctMax: number | null }
): Row {
  if (props.account === 'ALL') {
    return {
      key,
      label,
      ...ext,
      pfNow: pfNow.value,
      deltaPnl: -src.deltaLoss,
      net: src.combo.net_at,
      margin: src.combo.margin_total,
      real: src.combo.real,
      exch: src.combo.exch,
      breached: src.accounts.some(a => a.breached)
    };
  }
  const a = src.accounts.find(x => x.account === props.account);
  return {
    key,
    label,
    ...ext,
    pfNow: pfNow.value,
    deltaPnl: a?.delta_pnl ?? 0,
    net: a?.net_at ?? 0,
    margin: a?.margin_at ?? 0,
    real: a?.real ?? null,
    exch: a?.exch ?? null,
    breached: a?.breached ?? false
  };
}

/** 现价基准行在最前，其后按后端 level_order（到档价升序）= 极低 → 极高 */
const rows = computed<Row[]>(() => {
  const bl = props.levels.baseline;
  const out: Row[] = [
    makeRow(
      'base',
      '现价',
      { combo: bl.combo, accounts: bl.accounts, deltaLoss: 0 },
      { subjectCount: null, pctMin: null, pctMax: null }
    )
  ];
  for (const key of props.levels.level_order) {
    const lv = props.levels.levels[key];
    if (!lv) continue;
    out.push(
      makeRow(
        key,
        lv.label,
        { combo: lv.combo, accounts: lv.accounts, deltaLoss: lv.delta_loss },
        { subjectCount: lv.subject_count, pctMin: lv.pct_min, pctMax: lv.pct_max }
      )
    );
  }
  return out;
});

/** 首个触发追保的档位（不含现价基准行），整行浅红 */
const breachKey = computed(() => rows.value.find(r => r.key !== 'base' && r.breached)?.key ?? '');

function fmtPct(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v) * 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function pctCell(r: Row) {
  if (r.pctMin === null || r.pctMax === null) return h('span', { class: 'text-gray-400' }, '—');
  if (Math.abs(r.pctMax - r.pctMin) < 1e-6) return fmtPct(r.pctMin);
  return `${fmtPct(r.pctMin)} ~ ${fmtPct(r.pctMax)}`;
}

/** 档位列：档位名 + 实际参与标的数（无该档位的标的保持现价，不能默认全参与） */
function labelCell(r: Row) {
  return h('span', { class: 'lvl-cell' }, [
    h('span', { class: 'lvl-name' }, r.label),
    r.subjectCount === null
      ? h(NTag, { size: 'tiny', bordered: false, round: true }, { default: () => '0% 基准' })
      : h(NTag, { size: 'tiny', bordered: false, type: 'info' }, { default: () => `${r.subjectCount} 标的` })
  ]);
}

/** 列名随视角切换：单账户下叫「组合盈亏」会误导 */
const pnlTitle = computed(() => (props.account === 'ALL' ? '组合盈亏' : '账户盈亏'));

const columns = computed<DataTableColumns<Row>>(() => [
  { title: '档位', key: 'label', width: 120, render: labelCell },
  {
    title: '到档幅度区间',
    key: 'pct',
    width: 160,
    align: 'right' as const,
    render: pctCell
  },
  {
    title: '账户当前盈亏',
    key: 'pfNow',
    width: 130,
    align: 'right' as const,
    render: (r: Row) => pnl(r.pfNow)
  },
  {
    title: pnlTitle.value,
    key: 'deltaPnl',
    width: 130,
    align: 'right' as const,
    render: (r: Row) => pnl(r.deltaPnl)
  },
  { title: '账户净值', key: 'net', width: 130, align: 'right' as const, render: (r: Row) => fmtMoney(r.net) },
  { title: '保证金', key: 'margin', width: 120, align: 'right' as const, render: (r: Row) => fmtMoney(r.margin) },
  {
    title: '真实风险度',
    key: 'real',
    width: 110,
    align: 'right' as const,
    render: (r: Row) => h('span', { style: { color: levelColor(ratioLevel(r.real)) } }, fmtRatio(r.real))
  },
  {
    title: '交易所风险度',
    key: 'exch',
    width: 120,
    align: 'right' as const,
    render: (r: Row) => h('span', { style: { color: levelColor(ratioLevel(r.exch)) } }, fmtRatio(r.exch))
  },
  {
    title: '追保',
    key: 'breached',
    width: 90,
    render: (r: Row) =>
      r.breached
        ? h(NTag, { type: 'error', size: 'small' }, { default: () => '越线' })
        : h('span', { class: 'text-gray-400' }, '—')
  }
]);

/** scroll-x = 列宽和：加列/改列宽无需手改常量（🔒4.11） */
const scrollX = computed(() => columns.value.reduce((s, c) => s + Number(c.width ?? 0), 0));

function rowProps(row: Row) {
  const parts: string[] = ['cursor: pointer'];
  if (row.key === 'base') parts.push('background: rgba(24, 160, 88, 0.08)');
  if (row.key === breachKey.value) parts.push('background: rgba(208, 48, 80, 0.08)');
  if (row.key === props.activeLevel) parts.push('box-shadow: inset 3px 0 0 #2080f0');
  return { style: parts.join('; '), onClick: () => emit('select', row.key) };
}
</script>

<template>
  <!-- 单根元素：与 ① 账户总表 / ③ 逐仓总表一致，父页传的 class（mb-16px）正常生效 -->
  <div>
    <!--
      口径提示不塞进卡片：父页用 SectionBar 分节，这里只保留一行说明。
      五档幅度各标的不同，「到档幅度区间」是区间不是单一涨跌幅；「极高」为上涨侧压力。
      顶栏批量按钮下线后，本表是全页唯一档位入口，故一并写明跳过规则与「现价」行语义。
    -->
    <!--
 <div class="mb-6px text-11px text-gray-400">
      全部标的同步到同一档、各用自身 pp_*；无该档位的标的保持现价（档位列标注实际参与标的数）， 幅度为各标的的区间
      [推算]。「极高」是上涨方向，档位名不代表风险排序； 点击整行切换档位，点「现价」行 = 全部回现价。
    </div> 
-->
    <NDataTable
      :columns="columns"
      :data="rows"
      :row-props="rowProps"
      :pagination="false"
      :bordered="false"
      :row-key="(r: Row) => r.key"
      :scroll-x="scrollX"
    />
  </div>
</template>

<style scoped>
:deep(.n-data-table-th),
:deep(.n-data-table-td) {
  white-space: nowrap;
}

.lvl-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lvl-name {
  font-weight: 600;
}
</style>
