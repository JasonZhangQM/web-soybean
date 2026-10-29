<script setup lang="ts">
/**
 * 剧本与成交 Tab
 *
 * 剧本的三件关键事：
 * 1. **触发点可以是档位引用**（`trigger_ref`）：写「低」而不是写死 3.62，档位改版后剧本
 *    自动跟随——有效触发价 = `trigger_price ?? 当前档位值`，由后端算好放在
 *    `effective_trigger` / `trigger_ref_value` 里，前端只显示不重算。
 * 2. **状态是派生的**：暂停 / 生效，不要在前端另算一套。
 * 3. 成交行的「想法」来自 `bills_bill_note`，一行 = 一笔成交（后端已压掉 1:N）。
 */
import { ref, reactive, computed, h, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { saveVmPlan, deleteVmPlan, type VmTrade } from '@/service/api';
import VmDataTable from './VmDataTable.vue';
import { REF_LABEL, STATUS_TYPE, triggerText } from './planFormat';

defineOptions({ name: 'VmPlanTab' });

const props = defineProps<{ vmId: number; plans: Api.Irs.VmPlan[]; trades: VmTrade[] }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();

const REF_OPTIONS = Object.entries(REF_LABEL).map(([value, label]) => ({ value, label }));
const OP_OPTIONS = [
  { value: 'lte', label: '≤ 触发（跌到）' },
  { value: 'gte', label: '≥ 触发（涨到）' }
];

const showModal = ref(false);
const saving = ref(false);
const deletingSeq = ref<number | null>(null);

const form = reactive<{
  seq: number;
  trade_symbol: string;
  b_s: string;
  o_c: string | null;
  trigger_op: string;
  trigger_price: number | null;
  trigger_ref: string | null;
  qty: number | null;
  reason: string;
  is_cancelled: boolean;
}>({
  seq: 1,
  trade_symbol: '',
  b_s: '买',
  o_c: '开',
  trigger_op: 'lte',
  trigger_price: null,
  trigger_ref: null,
  qty: null,
  reason: '',
  is_cancelled: false
});

/**
 * 合约代码候选 —— **只是建议，不是白名单**。
 *
 * 来源：该标的「已归属成交」里出现过的 symbol（`props.trades`，链路是
 * `GET /value-monitors/{id}/trades` → `vm_map.trades_of` →
 * `bills_bill JOIN bills_group_symbol ON (category, symbol) WHERE g.vm_symbol = 标的`）。
 *
 * 所以它只包含**已经成交过的合约**。新挂牌的期权合约（如 IO2612 刚上市）、
 * 还没建仓的下一步滚仓合约，系统里根本不存在，永远进不了这个列表 ——
 * 这正是输入框必须允许自由输入、不能退化成「只能选」的原因。
 *
 * ⚠️ NAutoComplete 选中后 `v-model` 拿到的是 `option.label`，不是 `option.value`。
 * 所以 label 必须是纯代码；富文本放 `display`，交给 renderTradeSymbolLabel 渲染。
 */
const tradeSymbolOptions = computed(() => {
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string; display: string }> = [];
  for (const t of props.trades) {
    if (seen.has(t.symbol)) continue;
    seen.add(t.symbol);
    out.push({
      label: t.symbol,
      value: t.symbol,
      display: t.name ? `${t.symbol} ${t.name}` : t.symbol
    });
  }
  return out;
});

/** 下拉项显示「代码 + 名称」，选中后 v-model 只拿纯代码 */
function renderTradeSymbolLabel(option: { display?: string; label?: string }) {
  return option.display || option.label || '';
}

function openNew() {
  const maxSeq = props.plans.reduce((m, p) => Math.max(m, p.seq), 0);
  form.seq = maxSeq + 1;
  // 只有唯一一个历史合约才预填。≥2 个时预填第一个等于替你猜，猜错了保存前也看不出来。
  form.trade_symbol = tradeSymbolOptions.value.length === 1 ? tradeSymbolOptions.value[0].label : '';
  form.b_s = '买';
  form.o_c = '开';
  form.trigger_op = 'lte';
  form.trigger_price = null;
  form.trigger_ref = null;
  form.qty = null;
  form.reason = '';
  form.is_cancelled = false;
  showModal.value = true;
}

function openEdit(p: Api.Irs.VmPlan) {
  form.seq = p.seq;
  form.trade_symbol = p.trade_symbol;
  form.b_s = p.b_s;
  form.o_c = p.o_c;
  form.trigger_op = p.trigger_op || 'lte';
  form.trigger_price = p.trigger_price != null ? Number(p.trigger_price) : null;
  form.trigger_ref = p.trigger_ref;
  form.qty = p.qty;
  form.reason = p.reason ?? '';
  form.is_cancelled = p.is_cancelled;
  showModal.value = true;
}

async function handleSave() {
  // 自由输入的唯一风险是粘进来带空格/换行，落库前清掉（大小写不能动：SHFE.au2612P880 有大写有小写）
  const tradeSymbol = (form.trade_symbol ?? '').trim();
  if (!tradeSymbol) {
    window.$message?.warning('请填实际下单的合约代码');
    return;
  }
  form.trade_symbol = tradeSymbol;
  // 触发价与档位引用二选一：都填以显式价为准（后端也是这个优先级），提示一下避免误会
  if (form.trigger_price == null && !form.trigger_ref) {
    window.$message?.warning('触发价和档位引用至少填一个，否则这条剧本没有触发条件');
    return;
  }
  saving.value = true;
  try {
    const { error } = await saveVmPlan(props.vmId, {
      seq: form.seq,
      trade_symbol: form.trade_symbol,
      b_s: form.b_s,
      o_c: form.o_c || null,
      trigger_op: form.trigger_op,
      trigger_price: form.trigger_price,
      trigger_ref: form.trigger_ref,
      qty: form.qty,
      reason: form.reason || null,
      is_cancelled: form.is_cancelled
    });
    if (!error) {
      window.$message?.success('剧本已保存');
      showModal.value = false;
      emit('refresh');
    }
  } finally {
    saving.value = false;
  }
}

function handleDelete(p: Api.Irs.VmPlan) {
  window.$dialog?.warning({
    title: `删除第 ${p.seq} 条剧本？`,
    content: `${p.trade_symbol} ${p.b_s}${p.o_c ?? ''}。删了就查不到「当时打算怎么做」了；如果只是暂时不做，改「暂停」比删除好。`,
    positiveText: '仍要删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingSeq.value = p.seq;
      try {
        const { error } = await deleteVmPlan(props.vmId, p.seq);
        if (!error) {
          window.$message?.success('已删除');
          emit('refresh');
        }
      } finally {
        deletingSeq.value = null;
      }
    }
  });
}

// ---------------- 分页 ----------------
/**
 * 剧本、成交都 10 条/页（2026-10-23 用户定）—— 与列表页默认页大小一致，
 * 翻页器行为、页码密度都跟列表页对得上，不再为两张表各设一个不同的默认值。
 *
 * scroll-x 不手写常量：`VmDataTable` 按列宽和自动算（铁律 4.11 的漂移问题
 * 就是「改了列宽忘改常量」，交给它算一次解决）。
 */
const PAGE_SIZE = 10;

const planColumns = [
  { title: '序', key: 'seq', width: 50 },
  {
    title: '合约',
    key: 'trade_symbol',
    width: 190,
    render: (p: Api.Irs.VmPlan) => h('span', { style: 'user-select: text' }, p.trade_symbol)
  },
  { title: '方向', key: 'dir', width: 90, render: (p: Api.Irs.VmPlan) => `${p.b_s}${p.o_c ?? ''}` },
  {
    title: '触发条件',
    key: 'trigger',
    // 用 width 而不是 minWidth：scroll-x 要的是精确列宽和，minWidth 无法求和
    width: 280,
    render: (p: Api.Irs.VmPlan) => h('span', { class: 'text-12px' }, triggerText(p))
  },
  { title: '每次手数', key: 'qty', width: 80, align: 'right' as const, render: (p: Api.Irs.VmPlan) => p.qty ?? '-' },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (p: Api.Irs.VmPlan) =>
      h(NTag, { size: 'small', bordered: false, type: STATUS_TYPE[p.status] ?? 'default' }, { default: () => p.status })
  },
  {
    title: '理由',
    key: 'reason',
    width: 200,
    ellipsis: { tooltip: true },
    render: (p: Api.Irs.VmPlan) => p.reason || '-'
  },
  {
    title: '操作',
    key: 'action',
    width: 170,
    render: (p: Api.Irs.VmPlan) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          { text: true, size: 'tiny', type: 'primary', onClick: () => openEdit(p) },
          { default: () => '编辑' }
        ),
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            type: 'error',
            loading: deletingSeq.value === p.seq,
            onClick: () => handleDelete(p)
          },
          { default: () => '删除' }
        )
      ])
  }
];

const tradeColumns = [
  {
    title: '成交时间',
    key: 'trade_time',
    width: 160,
    render: (t: VmTrade) => t.trade_time?.slice(0, 19).replace('T', ' ') ?? '-'
  },
  {
    title: '合约',
    key: 'symbol',
    width: 180,
    render: (t: VmTrade) => h('span', { style: 'user-select: text' }, t.symbol)
  },
  { title: '方向', key: 'dir', width: 80, render: (t: VmTrade) => `${t.b_s ?? ''}${t.o_c ?? ''}` },
  {
    title: '成交价',
    key: 'price',
    width: 100,
    align: 'right' as const,
    render: (t: VmTrade) => Number(t.price).toFixed(4)
  },
  { title: '数量', key: 'vol', width: 80, align: 'right' as const },
  {
    title: '想法',
    key: 'note_idea',
    // 同「触发条件」：width 而非 minWidth，scroll-x 需要精确列宽和
    width: 260,
    ellipsis: { tooltip: true },
    render: (t: VmTrade) => (t.note_idea ? t.note_idea.replace(/\s*\n\s*/g, ' ') : '-')
  },
  { title: '账户', key: 'account', width: 60 }
];

// 编辑已有剧本时，「有效触发价」跟着档位变化：这里只提示，不重算
watch(
  () => form.trigger_ref,
  val => {
    if (val && form.trigger_price != null) {
      // 两者都填时以显式价为准——明确告诉用户，否则会以为引用生效了
      window.$message?.info('已同时填了触发价和档位引用：以显式触发价为准，清空触发价才会跟随档位');
    }
  }
);
</script>

<template>
  <div>
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">剧本（{{ plans.length }}）</span>
      <span class="text-12px text-gray-400">
        长期有效的档位动作，可反复执行；触发点写「低 / 中 / 高」= 引用档位，档位改版后自动跟随
      </span>
      <NButton size="tiny" ghost class="ml-auto" @click="openNew">新增剧本</NButton>
    </div>
    <VmDataTable :columns="planColumns" :data="plans" :page-size="PAGE_SIZE" />
    <NEmpty v-if="!plans.length" size="small" description="还没有剧本" class="my-8px" />

    <NDivider />

    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">归属成交（{{ trades.length }} 笔）</span>
      <span class="text-12px text-gray-400">融资融券不计入；想法在账单明细里写，复盘在「复盘」tab 写，这里只读</span>
    </div>
    <VmDataTable :columns="tradeColumns" :data="trades" :page-size="PAGE_SIZE" />
    <NEmpty v-if="!trades.length" size="small" description="这个标的还没有归属的成交" class="my-8px" />

    <NModal v-model:show="showModal" preset="card" title="剧本" class="w-640px" :mask-closable="false">
      <NForm label-placement="left" label-width="90px" :show-feedback="false">
        <NFormItem label="序号">
          <NInputNumber v-model:value="form.seq" :precision="0" :min="1" style="width: 120px" />
          <span class="ml-8px text-12px text-gray-400">同标的下序号唯一，保存会覆盖同序号那条</span>
        </NFormItem>
        <NFormItem label="合约代码">
          <div class="w-full">
            <NAutoComplete
              v-model:value="form.trade_symbol"
              :options="tradeSymbolOptions"
              :render-label="renderTradeSymbolLabel"
              clearable
              placeholder="直接输入合约代码，如 SHFE.au2612 / CFFEX.IO2612-P-4000"
              style="width: 100%"
            />
            <div class="mt-4px text-12px text-gray-400">
              可输入任意代码（包括系统里还没有的新挂牌合约）。
              <template v-if="tradeSymbolOptions.length">
                下拉里的 {{ tradeSymbolOptions.length }} 个只是该标的成交过的历史合约，供参考，不作校验。
              </template>
              <template v-else>该标的还没有成交记录，直接输入即可。</template>
            </div>
          </div>
        </NFormItem>
        <NFormItem label="方向">
          <NSpace>
            <NSelect
              v-model:value="form.b_s"
              :options="[
                { label: '买', value: '买' },
                { label: '卖', value: '卖' }
              ]"
              style="width: 100px"
            />
            <NSelect
              v-model:value="form.o_c"
              :options="[
                { label: '开', value: '开' },
                { label: '平', value: '平' }
              ]"
              clearable
              style="width: 100px"
            />
          </NSpace>
        </NFormItem>
        <NFormItem label="触发方向">
          <NSelect v-model:value="form.trigger_op" :options="OP_OPTIONS" style="width: 180px" />
        </NFormItem>
        <NFormItem label="触发价">
          <NInputNumber v-model:value="form.trigger_price" :precision="4" :step="0.0001" style="width: 160px" />
          <span class="ml-8px text-12px text-gray-400">填了就写死，不随档位变</span>
        </NFormItem>
        <NFormItem label="引用档位">
          <NSelect
            v-model:value="form.trigger_ref"
            :options="REF_OPTIONS"
            clearable
            placeholder="不引用"
            style="width: 160px"
          />
          <span class="ml-8px text-12px text-gray-400">选「低」= 触发价跟随档位「低」的当前值</span>
        </NFormItem>
        <NFormItem label="每次手数">
          <NInputNumber v-model:value="form.qty" :precision="0" :min="0" style="width: 160px" />
        </NFormItem>
        <NFormItem label="理由">
          <NInput v-model:value="form.reason" placeholder="为什么在这个点位做这个动作" />
        </NFormItem>
        <NFormItem label="暂停">
          <NSwitch v-model:value="form.is_cancelled" />
          <span class="ml-8px text-12px text-gray-400">暂停剧本（暂停比删除好：留下「当时想过但暂时不做」）</span>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton :loading="saving" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
