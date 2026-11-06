<script setup lang="ts">
import { computed } from 'vue';
import {
  bindingLabel,
  fmtMoney,
  fmtMoneyShort,
  fmtRatio,
  firstCallLabel,
  firstCallLevel,
  levelColor,
  ratioLevel,
  realOverLine,
  staleLabel,
  staleLevel,
  verdictLabel,
  verdictLevel
} from './utils';

defineOptions({ name: 'RiskKpiCards' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Bills.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
}>();

/** 账户卡；ALL 时为 null */
const acctCard = computed(() => (props.account === 'ALL' ? null : props.board.accounts[props.account]));

const net = computed(() => acctCard.value?.net0 ?? props.board.net_total);
const margin = computed(() => acctCard.value?.margin ?? props.board.margin_total);
const fin = computed(() => {
  if (acctCard.value) return acctCard.value.fin;
  return Object.values(props.board.accounts).reduce((s, a) => s + a.fin, 0);
});
const equity = computed(() => net.value + fin.value);
const real = computed(() => acctCard.value?.real ?? props.board.real_total);
/** 交易所风险度：单账户用账户卡；ALL 取 0% 情景组合行 */
const exch = computed(() => {
  if (acctCard.value) return acctCard.value.exch;
  return props.board.grid.sync?.['0.0']?.ALL?.exch ?? null;
});
const coverage = computed(() => (margin.value > 0 ? net.value / margin.value : null));

/** 首个追保点：单账户用账户维度，ALL 用组合维度（当前模式 sync） */
const firstCall = computed(() => {
  if (props.account === 'ALL') return props.board.first_call.sync ?? null;
  return props.board.first_call_all.sync?.[props.account] ?? null;
});
const firstCallHint = computed(() => {
  const fc = firstCall.value;
  if (!fc) return '未触发';
  const who = props.account === 'ALL' ? fc.account : props.account;
  const side = fc.direction === 'up' ? '上涨' : fc.direction === 'down' ? '下跌' : '';
  return side ? `${who} · ${side}侧` : `${who} · 当前已追保`;
});

/** 预算卡：ALL 取汇总，单账户取该账户（skip=现货账户，不判） */
const budget = computed(() => props.board.budget);
const budgetCard = computed(() => (props.account === 'ALL' ? null : (budget.value.accounts[props.account] ?? null)));
const budgetVerdict = computed(() =>
  props.account === 'ALL' ? budget.value.summary.verdict : (budgetCard.value?.verdict ?? 'skip')
);
const budgetLots = computed(() =>
  props.account === 'ALL'
    ? Object.values(budget.value.accounts).reduce((s, a) => s + (a.verdict === 'block' ? 0 : a.lots), 0)
    : (budgetCard.value?.lots ?? 0)
);
const budgetHeadroom = computed(() =>
  props.account === 'ALL' ? budget.value.summary.headroom_total : (budgetCard.value?.headroom ?? null)
);
/** 额度文案必须带「压力口径」：B04 账面还有 35 万净值、总闸即期只差 14.6 万，只报 66.5 万会被当成算错 */
const budgetHint = computed(() => {
  const drop = `${Math.round(budget.value.stress_drop * 100)}%`;
  if (budgetVerdict.value === 'skip') return '现货/空仓账户，不套保证金预算';
  const parts = [verdictLabel(budgetVerdict.value, budgetLots.value)];
  if (budgetCard.value) parts.push(`卡在 ${bindingLabel(budgetCard.value.binding, budgetCard.value)}`);
  else if (budget.value.summary.blocked_accounts.length)
    parts.push(`禁开：${budget.value.summary.blocked_accounts.join('、')}`);
  parts.push(`判据=跌 ${drop} 后的保证金`);
  return parts.join(' · ');
});
/** 账实差（BS 重估），单账户且非 0 时才提示——不报出来会被当成算错 */
const bookGap = computed(() => budgetCard.value?.book_gap ?? 0);
</script>

<template>
  <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">净资产</div>
        <div class="kpi-value">{{ fmtMoney(net) }}</div>
        <div class="kpi-hint">融资 {{ fmtMoney(fin) }} · 权益 {{ fmtMoney(equity) }}</div>
      </NCard>
    </NGi>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">保证金占用</div>
        <div class="kpi-value">{{ fmtMoney(margin) }}</div>
        <div class="kpi-hint">覆盖率 {{ fmtRatio(coverage) }}（净资产 / 保证金）</div>
      </NCard>
    </NGi>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">风险度（真实 / 交易所）</div>
        <div class="kpi-value">
          <span :style="{ color: levelColor(ratioLevel(real)) }">{{ fmtRatio(real) }}</span>
          <span class="kpi-sep">/</span>
          <span :style="{ color: levelColor(ratioLevel(exch)) }">{{ fmtRatio(exch) }}</span>
        </div>
        <div class="kpi-hint">
          追保判定看交易所口径
          <span v-if="realOverLine(real)" class="hint-alarm">· 真实口径已越线，保证金靠融资支撑</span>
        </div>
      </NCard>
    </NGi>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">首个追保点</div>
        <div class="kpi-value" :style="{ color: levelColor(firstCallLevel(firstCall)) }">
          {{ firstCallLabel(firstCall) }}
        </div>
        <div class="kpi-hint">
          {{ firstCallHint }}
          <span v-if="board.max_exposure_unbounded" style="color: #d03050">· 卖认购上行无上限</span>
        </div>
      </NCard>
    </NGi>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">可开额度（压力口径）</div>
        <div class="kpi-value" :style="{ color: levelColor(verdictLevel(budgetVerdict)) }">
          {{ budgetVerdict === 'skip' ? '不判' : fmtMoneyShort(budgetHeadroom) }}
        </div>
        <div class="kpi-hint">
          {{ budgetHint }}
          <span v-if="Math.abs(bookGap) > 0.5" class="hint-gap">· 账实差 {{ fmtMoney(bookGap) }}（BS 重估）</span>
        </div>
      </NCard>
    </NGi>
    <NGi span="24 s:12 m:8 l:4">
      <NCard :bordered="false" class="card-wrapper h-full" size="small">
        <div class="kpi-label">行情新鲜度</div>
        <div class="kpi-value" :style="{ color: levelColor(staleLevel(board.stale_days)) }">
          {{ staleLabel(board.stale_days, board.data_as_of) }}
        </div>
        <div class="kpi-hint">{{ board.engine_ver }} · 计算日 {{ board.calc_date }}</div>
      </NCard>
    </NGi>
  </NGrid>
</template>

<style scoped>
.kpi-label {
  font-size: 13px;
  color: #909399;
}

.kpi-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
}

.kpi-sep {
  margin: 0 4px;
  color: #c0c4cc;
  font-weight: 400;
}

.kpi-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.hint-alarm {
  color: #d03050;
}

.hint-gap {
  color: #f0a020;
}
</style>
