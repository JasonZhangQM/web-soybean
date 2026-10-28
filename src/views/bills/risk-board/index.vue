<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { fetchRiskBoard, runRiskBoard } from '@/service/api';
import { createTablePagination } from '@/hooks/common/table';
import { usePageState } from '@/hooks/common/page-state';
import AccountRiskCards from './modules/AccountRiskCards.vue';
import ContractTable from './modules/ContractTable.vue';
import MarginStackChart from './modules/MarginStackChart.vue';
import RiskKpiCards from './modules/RiskKpiCards.vue';
import ScenarioTable from './modules/ScenarioTable.vue';

defineOptions({ name: 'BillsRiskBoardPage' });

const router = useRouter();

const loading = ref(false);
const runLoading = ref(false);
/** 看板数据；409 等业务错误时置空 */
const board = ref<Api.Bills.RiskBoard | null>(null);
/** 阻断/失败原因（后端 detail 原样透出） */
const blockMsg = ref('');

/** 筛选条件：mode/account 为前端切列，horizon/iv_mult 需回后端重算 */
const query = reactive({
  mode: 'sync',
  horizon: 'now',
  iv_mult: 1.0,
  account: 'ALL'
});

// 会话记忆：切回本页时恢复上次的模式/口径/账户（本页无分页，分页参数仅占位）
const pagination = createTablePagination();
usePageState({ searchParams: query, pagination });

/** 后端未返回 mode_names 时的兜底（与 risk_scenario.MODE_NAMES 一致） */
const MODE_FALLBACK: Record<string, string> = {
  sync: 'A 同步同幅',
  astock_only: 'B 仅A股（黄金/纳指不动）',
  index_only: 'C 仅股指（个股/黄金/纳指不动）'
};

const modeNames = computed(() => board.value?.mode_names ?? MODE_FALLBACK);
const modeOptions = computed(() =>
  Object.keys(modeNames.value).map(key => ({ label: modeNames.value[key], value: key }))
);

const horizonOptions = [
  { label: '即期（BS 重估）', value: 'now' },
  { label: '到期（内在价值）', value: 'expiry' }
];

/** 账户下拉：ALL + 后端账户卡（空账户也保留，便于核对豁免口径） */
const accountOptions = computed(() => {
  const names = board.value ? Object.keys(board.value.accounts).sort() : [];
  return [{ label: '组合（ALL）', value: 'ALL' }, ...names.map(name => ({ label: name, value: name }))];
});

/** 模式含义注记 */
const modeHint = computed(() => modeNames.value[query.mode] ?? query.mode);

/** 从 axios 错误体里取 FastAPI 的 detail */
function detailOf(error: unknown): string {
  const err = error as { response?: { data?: { detail?: string } } };
  return err?.response?.data?.detail ?? '';
}

/** 请求序号：IV 滑块连续触发时只认最后一次响应 */
let reqSeq = 0;

async function fetchData() {
  const seq = ++reqSeq;
  loading.value = true;
  const started = Date.now();
  try {
    const { data, error } = await fetchRiskBoard({
      horizon: query.horizon as 'now' | 'expiry',
      iv_mult: query.iv_mult,
      detail: true // 保证金结构图依赖逐仓明细
    });
    if (seq !== reqSeq) return;
    if (error || !data) {
      blockMsg.value = detailOf(error) || '风险看板计算失败';
      board.value = null;
      return;
    }
    blockMsg.value = '';
    board.value = data;
    // 账户在新口径下不存在时退回组合视角
    if (query.account !== 'ALL' && !data.accounts[query.account]) query.account = 'ALL';
  } finally {
    if (seq === reqSeq) {
      // 最短 300ms：避免参数切换时 loading 闪烁
      const rest = 300 - (Date.now() - started);
      if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest));
      loading.value = false;
    }
  }
}

/** IV 滑块连续拖动：防抖后重算 */
let ivTimer: number | undefined;
watch(
  () => query.iv_mult,
  () => {
    window.clearTimeout(ivTimer);
    ivTimer = window.setTimeout(fetchData, 400);
  }
);

onUnmounted(() => window.clearTimeout(ivTimer));

function handleHorizonChange() {
  fetchData();
}

/** 日终重算并落库：任务化入口，与列表页的行情同步互不影响 */
async function handleRun() {
  if (runLoading.value) return;
  runLoading.value = true;
  const started = Date.now();
  try {
    const { data, error } = await runRiskBoard();
    if (error || !data) {
      window.$message?.error(detailOf(error) || '重算失败');
      return;
    }
    const disabled = data.disabled_contracts?.length ? `，停用过期合约 ${data.disabled_contracts.length} 个` : '';
    window.$message?.success(`重算完成：写入 ${data.rows_upserted} 行${disabled}`);
    await fetchData();
  } finally {
    const rest = 300 - (Date.now() - started);
    if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest));
    runLoading.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="情景模式">
          <NSelect v-model:value="query.mode" :options="modeOptions" style="width: 230px" />
        </NFormItem>
        <NFormItem label="时点口径">
          <NSelect
            v-model:value="query.horizon"
            :options="horizonOptions"
            style="width: 150px"
            @update:value="handleHorizonChange"
          />
        </NFormItem>
        <NFormItem label="IV 倍数" :show-feedback="false">
          <div class="iv-box">
            <NSlider v-model:value="query.iv_mult" :min="0.8" :max="2.0" :step="0.1" style="width: 150px" />
            <span class="iv-value">{{ query.iv_mult.toFixed(1) }}×</span>
            <NButton size="tiny" secondary @click="query.iv_mult = 1.5">1.5×</NButton>
          </div>
        </NFormItem>
        <NFormItem label="账户">
          <NSelect v-model:value="query.account" :options="accountOptions" style="width: 140px" />
        </NFormItem>
        <NFormItem class="ml-auto">
          <NButton :loading="runLoading" @click="handleRun">
            <template #icon><SvgIcon icon="mdi:calculator-variant" /></template>
            重算落库
          </NButton>
        </NFormItem>
      </NForm>
      <div class="toolbar-note">
        当前模式：{{ modeHint }}；{{
          query.horizon === 'expiry' ? '到期口径=时间价值归零，仅作对照' : '即期口径=BS 重估'
        }}； 涨幅档以「+」显示，跌幅档以「−」显示。
      </div>
    </NCard>

    <NCard v-if="blockMsg" :bordered="false" class="card-wrapper">
      <NResult status="error" title="无法计算风险看板" :description="blockMsg">
        <template #footer>
          <NSpace justify="center">
            <NButton @click="router.push({ name: 'irs_option-quote' })">去同步期权行情</NButton>
            <NButton @click="fetchData">重新计算</NButton>
          </NSpace>
        </template>
      </NResult>
    </NCard>

    <NSpin v-else-if="board" :show="loading" description="计算中">
      <NAlert
        v-if="board.warnings.length"
        :type="board.stale_days >= 2 ? 'error' : 'warning'"
        :title="`数据提示（${board.warnings.length}）`"
        class="mb-16px"
      >
        <ul class="warn-list">
          <li v-for="(w, i) in board.warnings" :key="i">{{ w }}</li>
        </ul>
      </NAlert>

      <div class="mb-16px">
        <RiskKpiCards :board="board" :account="query.account" />
      </div>

      <div class="section-title">账户风险卡（点击切换视角；空账户豁免追保）</div>
      <div class="mb-16px">
        <AccountRiskCards :board="board" :account="query.account" @select="val => (query.account = val)" />
      </div>

      <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
        <NGi span="24 m:14">
          <NCard :bordered="false" class="card-wrapper h-full" size="small">
            <template #header>情景压力表（{{ modeHint }}）</template>
            <ScenarioTable :board="board" :mode="query.mode" :account="query.account" />
          </NCard>
        </NGi>
        <NGi span="24 m:10">
          <NCard :bordered="false" class="card-wrapper h-full" size="small">
            <template #header>保证金结构（按品种族）</template>
            <MarginStackChart :board="board" :mode="query.mode" />
          </NCard>
        </NGi>
      </NGrid>

      <div class="mt-16px">
        <ContractTable :board="board" :account="query.account" />
      </div>
    </NSpin>
  </div>
</template>

<style scoped>
.toolbar-note {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.section-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.warn-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}

.iv-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.iv-value {
  min-width: 34px;
  font-variant-numeric: tabular-nums;
}
</style>
