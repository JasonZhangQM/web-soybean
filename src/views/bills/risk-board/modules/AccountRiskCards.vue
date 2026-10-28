<script setup lang="ts">
import { computed } from 'vue';
import { fmtMoney, fmtRatio, firstCallLabel, firstCallLevel, levelColor, ratioLevel } from './utils';

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
    idle: false
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
        idle: Math.abs(card.net0) < 1e-6 && Math.abs(card.margin) < 1e-6
      };
    });

  return [allRow, ...acctRows];
});

/** 点击卡片切换账户视角（组合会掩盖单账户爆仓，需能逐户下钻） */
function handleSelect(row: AccountRow) {
  emit('select', row.account);
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
