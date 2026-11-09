<script setup lang="ts">
/**
 * 到档情景面板（2026-11-09 起并入「档位」Tab 的折叠区，不再是独立 Tab）：
 * 五档并列、假设到价，展示该标的项下持仓的盈亏 / 保证金 / 风险指标。
 * 由父组件的折叠区决定是否挂载；`defineExpose({ load })` 供保存档位后重算。
 *
 * 口径全部由后端 `GET /underlying-monitors/{id}/level-scenario` 给出，本组件不自算任何
 * 保证金、净值或风险度（铁律 4.13：前端禁自算）。红亏绿盈与风险度配色复用风险看板 utils。
 *
 * 三类表格统一走 UnderlyingDataTable：它自动按列宽求和喂 scroll-x、自带 :deep() 禁折行，
 * 且 NDataTable 不写 size（铁律 4.7 / 4.11）。
 */
import { computed, h, onMounted, ref, watch } from 'vue';
import { NAlert, NButton, NDescriptions, NDescriptionsItem, NRadioButton, NRadioGroup, NSpin, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  fetchUnderlyingLevelScenario,
  type LevelScenario,
  type LevelScenarioAccount,
  type LevelScenarioLevel,
  type LevelScenarioPosition
} from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import { fmtMoney, fmtPrice, fmtRatio, levelColor, ratioLevel } from '@/views/irs/risk-board/modules/utils';

defineOptions({ name: 'UnderlyingLevelScenarioTab' });

const props = defineProps<{ umId: number; symbol: string }>();

const horizon = ref<'now' | 'expiry'>('now');
const data = ref<LevelScenario | null>(null);
const loading = ref(false);
const err = ref('');
const activeLevel = ref('m');

async function load() {
  loading.value = true;
  err.value = '';
  const { data: d, error } = await fetchUnderlyingLevelScenario(props.umId, horizon.value);
  if (error || !d) {
    const detail = (error as any)?.response?.data?.detail;
    err.value = typeof detail === 'string' ? detail : '到档情景计算失败，请稍后重试。';
    data.value = null;
  } else {
    data.value = d;
    if (!d.levels[activeLevel.value]) activeLevel.value = d.level_order[0] ?? '';
  }
  loading.value = false;
}

onMounted(load);
watch(horizon, load);
/** 供档位 Tab 在保存 / 删除档位后重算（仅在折叠区已展开、组件已挂载时调用） */
defineExpose({ load });
/** 换标的时清空重算：umId 是主键，symbol 一并监听可防 id 漂移（抽屉注释里那条历史坑） */
watch(
  () => [props.umId, props.symbol] as const,
  () => {
    data.value = null;
    load();
  }
);

const horizonLabel = computed(() => (horizon.value === 'now' ? '即期（BS 重估）' : '到期（内在价值）'));
const otherLabel = computed(() => (horizon.value === 'now' ? '到期' : '即期'));
const current = computed<LevelScenarioLevel | null>(() => data.value?.levels[activeLevel.value] ?? null);

/** 盈亏染色：沿用风险看板口径，亏红盈绿 */
function pnl(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { style: { color: n < 0 ? '#d03050' : '#18a058' } }, fmtMoney(n));
}

/** 保证金变化：占用增加染红、减少染绿，显示带符号的原值（不取相反数） */
function marginDelta(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return h('span', { style: { color: n > 0 ? '#d03050' : '#18a058' } }, `${n > 0 ? '+' : ''}${fmtMoney(n)}`);
}

/** 风险度：4 位小数 + 分档配色 */
function ratio(v: number | null | undefined) {
  return h('span', { style: { color: levelColor(ratioLevel(v)) } }, fmtRatio(v));
}

function pct(v: number | null | undefined) {
  const n = Number(v ?? 0) * 100;
  return h('span', { style: { color: n < 0 ? '#18a058' : '#d03050' } }, `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
}

interface LevelRow {
  key: string;
  label: string;
  pp: number;
  pct: number;
  delta_pnl: number;
  other_delta_pnl: number | null;
  margin_at: number;
  margin_delta: number;
  combo_margin: number;
  combo_net: number;
  real: number | null;
  exch: number | null;
  breached: number;
}

const levelRows = computed<LevelRow[]>(() => {
  const d = data.value;
  if (!d) return [];
  return d.level_order.map(key => {
    const lv = d.levels[key];
    const cmp = d.horizon_compare[key];
    return {
      key,
      label: lv.label,
      pp: lv.pp,
      pct: lv.pct,
      delta_pnl: lv.total.delta_pnl,
      other_delta_pnl: cmp?.delta_pnl ?? null,
      margin_at: lv.total.margin_at,
      margin_delta: lv.total.margin_delta,
      combo_margin: lv.combo.margin_total,
      combo_net: lv.combo.net_at,
      real: lv.combo.real,
      exch: lv.combo.exch,
      breached: lv.accounts.filter(a => a.breached).length
    };
  });
});

const levelColumns: DataTableColumns<LevelRow> = [
  {
    title: '档位',
    key: 'label',
    width: 118,
    render: (r: LevelRow) =>
      h(
        NButton,
        {
          text: true,
          type: activeLevel.value === r.key ? 'primary' : 'default',
          onClick: () => {
            activeLevel.value = r.key;
          }
        },
        { default: () => `${r.label} ${fmtPrice(r.pp)}` }
      )
  },
  { title: '到档涨跌', key: 'pct', width: 100, align: 'right' as const, render: (r: LevelRow) => pct(r.pct) },
  {
    title: '标的 Δ盈亏',
    key: 'delta_pnl',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => pnl(r.delta_pnl)
  },
  {
    title: `${otherLabel.value} Δ盈亏`,
    key: 'other_delta_pnl',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => pnl(r.other_delta_pnl)
  },
  {
    title: '标的保证金',
    key: 'margin_at',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.margin_at)
  },
  {
    title: '保证金变化',
    key: 'margin_delta',
    width: 120,
    align: 'right' as const,
    render: (r: LevelRow) => marginDelta(r.margin_delta)
  },
  {
    title: '组合保证金',
    key: 'combo_margin',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.combo_margin)
  },
  {
    title: '组合净值',
    key: 'combo_net',
    width: 130,
    align: 'right' as const,
    render: (r: LevelRow) => fmtMoney(r.combo_net)
  },
  { title: '真实风险度', key: 'real', width: 110, align: 'right' as const, render: (r: LevelRow) => ratio(r.real) },
  { title: '交易所风险度', key: 'exch', width: 120, align: 'right' as const, render: (r: LevelRow) => ratio(r.exch) },
  {
    title: '追保账户',
    key: 'breached',
    width: 90,
    align: 'right' as const,
    render: (r: LevelRow) =>
      r.breached ? h(NTag, { type: 'error', size: 'small' }, { default: () => `${r.breached} 个` }) : '—'
  }
];

function kindLabel(p: LevelScenarioPosition) {
  if (p.kind === 'fut') return '期货';
  if (p.kind === 'stock') return '证券';
  if (p.kind === 'put') return '期权·沽';
  if (p.kind === 'call') return '期权·购';
  return p.kind;
}

const positionColumns: DataTableColumns<LevelScenarioPosition> = [
  { title: '账户', key: 'account', width: 80 },
  { title: '合约', key: 'symbol', width: 190 },
  { title: '类别', key: 'kind', width: 90, render: (p: LevelScenarioPosition) => kindLabel(p) },
  {
    title: '数量',
    key: 'qty',
    width: 80,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => String(p.qty ?? '-')
  },
  {
    title: '行权价',
    key: 'strike',
    width: 90,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => (p.strike != null ? fmtMoney(p.strike) : '-')
  },
  {
    title: '基准价 → 到档价',
    key: 'price_now',
    width: 160,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => `${fmtPrice(p.price_now)} → ${fmtPrice(p.price_at)}`
  },
  {
    title: 'Δ盈亏',
    key: 'delta_pnl',
    width: 130,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => pnl(p.delta_pnl)
  },
  {
    title: '到档保证金',
    key: 'margin_at',
    width: 130,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => fmtMoney(p.margin_at)
  },
  {
    title: '保证金变化',
    key: 'margin_delta',
    width: 120,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => marginDelta(p.margin_delta)
  },
  {
    title: '风险敞口',
    key: 'risk_exposure',
    width: 130,
    align: 'right' as const,
    render: (p: LevelScenarioPosition) => fmtMoney(p.risk_exposure)
  }
];

const accountColumns: DataTableColumns<LevelScenarioAccount> = [
  { title: '账户', key: 'account', width: 90 },
  {
    title: '到档净值',
    key: 'net_at',
    width: 130,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.net_at)
  },
  {
    title: '客户权益',
    key: 'eq_at',
    width: 130,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.eq_at)
  },
  {
    title: '保证金',
    key: 'margin_at',
    width: 130,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtMoney(a.margin_at)
  },
  {
    title: '真实风险度',
    key: 'real',
    width: 110,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => ratio(a.real)
  },
  {
    title: '交易所风险度',
    key: 'exch',
    width: 120,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => ratio(a.exch)
  },
  {
    title: '覆盖率',
    key: 'coverage',
    width: 100,
    align: 'right' as const,
    render: (a: LevelScenarioAccount) => fmtRatio(a.coverage)
  },
  {
    title: '追保(模型)',
    key: 'breached',
    width: 110,
    render: (a: LevelScenarioAccount) =>
      a.breached ? h(NTag, { type: 'error', size: 'small' }, { default: () => '越线' }) : '—'
  }
];

const basisText = computed(() => {
  const b = data.value?.price_basis;
  if (!b) return '';
  const gap = b.gap_pct == null ? '量纲不同，不可比' : `${(b.gap_pct * 100).toFixed(2)}%`;
  return `监测标的价 ${fmtPrice(b.um_price)}；风险引擎基准价 ${b.comparable_count} 条可比，偏差 ${gap}`;
});
</script>

<template>
  <div>
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">到档情景</span>
      <NTag size="small" :bordered="false" type="info">五档并列 · 假设到价</NTag>
      <NTag size="small" :bordered="false" type="warning">保证金 [推算]</NTag>
      <NRadioGroup v-model:value="horizon" class="ml-8px">
        <NRadioButton value="now">即期</NRadioButton>
        <NRadioButton value="expiry">到期</NRadioButton>
      </NRadioGroup>
      <NButton size="tiny" class="ml-auto" :loading="loading" @click="load">刷新</NButton>
    </div>

    <NAlert type="warning" :bordered="false" class="mb-12px">
      全部数值为 [推算]：持仓按同百分比平移（beta=1），义务仓保证金按交易所公式逐档重算，
      未读日结单「持仓汇总」实读值；追保标记为模型口径，不构成追保结论。
    </NAlert>

    <NSpin :show="loading">
      <NAlert v-if="err" type="error" :bordered="false" class="mb-12px">
        {{ err }}
        <div class="mt-8px text-12px">
          常见原因：期权行情陈旧、合约未认领、行情日混用。请到批量同步页同步期权行情后重试。
        </div>
        <NButton size="tiny" class="mt-8px" @click="load">重试</NButton>
      </NAlert>

      <template v-if="data">
        <NDescriptions :column="2" label-placement="left" bordered size="small" class="mb-12px">
          <NDescriptionsItem label="计算日 / 行情">
            {{ data.as_of }} · {{ data.data_as_of || '—' }}（{{
              data.stale_days <= 0 ? '当日' : `T−${data.stale_days}`
            }}）
          </NDescriptionsItem>
          <NDescriptionsItem label="当前档位带">{{ data.zone || '—' }}</NDescriptionsItem>
          <NDescriptionsItem label="时点口径">{{ horizonLabel }}</NDescriptionsItem>
          <NDescriptionsItem label="引擎版本">{{ data.engine_ver }}</NDescriptionsItem>
          <NDescriptionsItem label="基准价" :span="2">{{ basisText }}</NDescriptionsItem>
          <NDescriptionsItem label="归属命中" :span="2">
            在仓归属 {{ data.mapping.in_position_group_rows }} 条 / 命中 {{ data.mapping.matched_positions }} 条持仓；
            未归属在仓 {{ data.mapping.unmapped.rows }} 条
          </NDescriptionsItem>
        </NDescriptions>

        <NAlert v-if="!data.mapping.matched_positions" type="info" :bordered="false" class="mb-12px">
          该标的当前无在仓持仓，仅展示档位价；盈亏与保证金为空。
        </NAlert>

        <div class="mb-8px flex flex-wrap items-center gap-8px">
          <span class="font-500">五档 × 组合风险指标</span>
          <span class="text-12px text-gray-400">点击档位名切换下方明细；「{{ otherLabel }} Δ盈亏」为双时点对照列</span>
        </div>
        <UnderlyingDataTable :columns="levelColumns" :data="levelRows" :page-size="0" class="mb-16px" />
        <div class="mb-16px text-12px text-gray-400">
          组合保证金 / 净值 / 风险度为账户全部持仓口径，含本情景中价格冻结的其它持仓。 追保只判交易所口径；真实口径 ≥1
          而交易所口径 &lt;1 时须单独留意。
        </div>

        <template v-if="current">
          <div class="mb-8px flex flex-wrap items-center gap-8px">
            <span class="font-500">{{ current.label }}档持仓明细</span>
            <NTag size="small" :bordered="false">档位价 {{ fmtPrice(current.pp) }}</NTag>
            <NTag size="small" :bordered="false" :type="current.total.delta_pnl < 0 ? 'error' : 'success'">
              标的 Δ盈亏 {{ fmtMoney(current.total.delta_pnl) }}
            </NTag>
            <NTag size="small" :bordered="false" type="warning">
              到档浮盈 {{ fmtMoney(current.total.pf_at_level) }} [推算]
            </NTag>
            <span class="text-12px text-gray-400">
              敞口 {{ fmtMoney(current.total.risk_exposure) }} · 回撤率
              {{ current.total.drawdown_ratio == null ? '-' : `${(current.total.drawdown_ratio * 100).toFixed(2)}%` }}
            </span>
          </div>
          <UnderlyingDataTable :columns="positionColumns" :data="current.positions" :page-size="0" class="mb-16px" />

          <div class="mb-8px font-500">{{ current.label }}档 · 分账户风险指标</div>
          <UnderlyingDataTable :columns="accountColumns" :data="current.accounts" :page-size="0" class="mb-16px" />
        </template>

        <div class="mb-8px font-500">口径与告警</div>
        <NAlert v-for="(w, i) in data.warnings" :key="i" type="default" :bordered="false" class="mb-4px">
          {{ w }}
        </NAlert>
      </template>
    </NSpin>
  </div>
</template>
