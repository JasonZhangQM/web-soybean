<script setup lang="ts">
import { computed } from 'vue';
import {
  fmtMoney,
  fmtRatio,
  firstCallLabel,
  firstCallLevel,
  levelColor,
  ratioLevel,
  staleLabel,
  staleLevel
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
        <div class="kpi-hint">追保判定只看交易所口径（≥1 触发）</div>
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
</style>
