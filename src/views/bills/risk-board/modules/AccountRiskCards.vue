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
  verdictLevel
} from './utils';

defineOptions({ name: 'AccountRiskCards' });

const props = defineProps<{
  /** 看板数据 */
  board: Api.Bills.RiskBoard;
  /** 当前账户：ALL 或具体账户 */
  account: string;
}>();

const emit = defineEmits<{ (e: 'select', account: string): void }>();

interface AccountRow {
  /** 账户名；ALL 表示组合 */
  account: string;
  /** 账户卡；组合行为 null */
  card: Api.Bills.RiskBoardAccount | null;
  net: number;
  fin: number;
  eq: number;
  margin: number;
  real: number | null;
  exch: number | null;
  /** 该账户首个追保点 */
  firstCall: Api.Bills.RiskBoardFirstCall | null;
  /** 空账户：无净值且无保证金，后端豁免追保判定 */
  idle: boolean;
  /** 预算卡；组合行为 null */
  budget: Api.Bills.BudgetAccount | null;
}

/** 组合行在前，其余按账户名排序 */
const rows = computed<AccountRow[]>(() => {
  const finTotal = Object.values(props.board.accounts).reduce((s, a) => s + (a.fin ?? 0), 0);
  const allRow: AccountRow = {
    account: 'ALL',
    card: null,
    net: props.board.net_total,
    fin: finTotal,
    eq: props.board.net_total + finTotal,
    margin: props.board.margin_total,
    real: props.board.real_total,
    exch: props.board.grid.sync?.['0.0']?.ALL?.exch ?? null,
    firstCall: props.board.first_call.sync ?? null,
    idle: false,
    budget: null
  };

  const acctRows = Object.keys(props.board.accounts)
    .sort()
    .map(name => {
      const card = props.board.accounts[name];
      return {
        account: name,
        card,
        net: card.net0,
        fin: card.fin,
        eq: card.eq,
        margin: card.margin,
        real: card.real,
        exch: card.exch,
        firstCall: props.board.first_call_all.sync?.[name] ?? null,
        idle: Math.abs(card.net0) < 1e-6 && Math.abs(card.margin) < 1e-6,
        budget: props.board.budget.accounts[name] ?? null
      };
    });

  return [allRow, ...acctRows];
});

/** 点击卡片切换账户视角（组合会掩盖单账户爆仓，需能逐户下钻） */
function handleSelect(row: AccountRow) {
  emit('select', row.account);
}

/**
 * 预算行文案。缺口一律注明「压力口径」——那是跌 15% 之后的保证金，
 * 与即期缺口差好几倍，不注明会被读成"现在就亏了这么多"。
 */
function budgetText(row: AccountRow): string {
  const card = row.budget;
  if (!card) {
    const s = props.board.budget.summary;
    if (s.verdict === 'skip') return '不判（无保证金持仓）';
    return s.headroom_total !== null && s.headroom_total < 0
      ? `合计缺口 ${fmtMoneyShort(-s.headroom_total)}（压力口径）`
      : '额度为正，但单账户均不足一手';
  }
  if (card.verdict === 'skip') return '不判（无保证金持仓）';
  if (card.lots > 0) return `可开 ${card.lots} 手（卡在 ${bindingLabel(card.binding, card)}）`;
  if (card.headroom !== null && card.headroom < 0) return `可开 0 手（压力口径缺口 ${fmtMoneyShort(-card.headroom)}）`;
  return `可开 0 手（额度 ${fmtMoneyShort(card.headroom)} 不足一手）`;
}

/** 预算行配色：block 红 / over 橙 / ok 绿 / 不判灰 */
function budgetColor(row: AccountRow): string {
  const v = row.budget ? row.budget.verdict : props.board.budget.summary.verdict;
  return levelColor(verdictLevel(v));
}
</script>

<template>
  <NGrid :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
    <NGi v-for="row in rows" :key="row.account" span="24 s:12 m:8 l:6">
      <NCard
        :bordered="false"
        size="small"
        class="acct-card"
        :class="{ 'is-idle': row.idle, 'is-active': row.account === props.account }"
        @click="handleSelect(row)"
      >
        <div class="acct-head">
          <span class="acct-name">{{ row.account === 'ALL' ? '组合' : row.account }}</span>
          <NTag v-if="row.idle" size="small" type="default">空账户</NTag>
          <NTag v-else-if="row.firstCall?.direction === 'now'" size="small" type="error">已追保</NTag>
          <template v-else-if="realOverLine(row.real)">
            <NTooltip trigger="hover">
              <template #trigger>
                <NTag size="small" type="warning" :bordered="false">真实口径越线</NTag>
              </template>
              保证金 {{ fmtMoney(row.margin) }} 已超过自有净值 {{ fmtMoney(row.net) }}， 缺口由融资
              {{ fmtMoney(row.fin) }} 填补。交易所口径尚未触发券商追保， 但自有资金已无缓冲。
            </NTooltip>
          </template>
        </div>
        <div class="acct-line">
          <span class="acct-label">净资产</span>
          <span class="acct-value">{{ fmtMoney(row.net) }}</span>
        </div>
        <div class="acct-line">
          <span class="acct-label">融资 / 权益</span>
          <span class="acct-value">{{ fmtMoney(row.fin) }} / {{ fmtMoney(row.eq) }}</span>
        </div>
        <div class="acct-line">
          <span class="acct-label">保证金</span>
          <span class="acct-value">{{ fmtMoney(row.margin) }}</span>
        </div>
        <div class="acct-line">
          <span class="acct-label">风险度 真实/交易所</span>
          <span class="acct-value">
            <span :style="{ color: levelColor(ratioLevel(row.real)) }">{{ fmtRatio(row.real) }}</span>
            <span class="sep">/</span>
            <span :style="{ color: levelColor(ratioLevel(row.exch)) }">{{ fmtRatio(row.exch) }}</span>
          </span>
        </div>
        <div class="acct-line">
          <span class="acct-label">首个追保</span>
          <span class="acct-value" :style="{ color: levelColor(firstCallLevel(row.firstCall)) }">
            {{ row.idle ? '豁免' : firstCallLabel(row.firstCall) }}
          </span>
        </div>
        <div class="acct-line">
          <span class="acct-label">可开额度</span>
          <span class="acct-value" :style="{ color: budgetColor(row) }">{{ budgetText(row) }}</span>
        </div>
      </NCard>
    </NGi>
  </NGrid>
</template>

<style scoped>
.acct-card {
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.acct-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.acct-card.is-active {
  box-shadow: inset 0 0 0 2px #2080f0;
}

.acct-card.is-idle {
  opacity: 0.55;
}

.acct-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.acct-name {
  font-size: 15px;
  font-weight: 600;
}

.acct-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
}

.acct-label {
  color: #909399;
}

.acct-value {
  font-variant-numeric: tabular-nums;
}

.sep {
  margin: 0 2px;
  color: #c0c4cc;
}
</style>
