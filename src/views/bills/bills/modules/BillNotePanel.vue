<script setup lang="ts">
/**
 * 单笔成交的交易笔记（只保留「想法」）
 *
 * 复盘已上移到标的层（标的档案 → 复盘 tab，锚定研究版本），成交上只留下单当时的「想法」。
 *
 * 设计要点（对应方案 v3 §7.2）：
 * 1. **独立端点**：保存走 `PUT /bills/bills/{id}/note/{kind}`，不混进 36 字段的
 *    `PATCH /bills/bills/{id}` —— 那是宽口子，一旦有人给它加「回写全列」，
 *    笔记会被静默冲成 NULL。
 * 2. **`content_at` 只读**：后端在首次写入时打，前端不可传。否则「当时写的」可以被
 *    伪造，反自欺就失效了。这里也据此算出「晚 N 天补写」并标黄。
 * 3. **整体保存**：想法与剧本随弹窗「保存」一次性提交；两项都空 = 删除笔记，
 *    只选剧本时正文可为空。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NAlert } from 'naive-ui';
import { fetchBillNotes, saveBillNote, fetchAllPlans } from '@/service/api';

defineOptions({ name: 'BillNotePanel' });

/** 剧本下拉的数据形态：账单页自己拉全量，标的页直接传该标的已有的剧本 */
type PlanLite = {
  id: number;
  vm_symbol: string;
  trade_symbol: string;
  b_s: string;
  o_c?: string | null;
  is_cancelled?: boolean;
  reason?: string | null;
  trigger_op?: string | null;
};

const props = defineProps<{
  /** 成交 ID；null = 弹窗还没选中行 */
  billId: number | null;
  /** 成交时间（yyyy-MM-dd HH:mm:ss），用于判断笔记是不是事后补写 */
  tradeTime?: string | null;
  /**
   * 可关联的剧本。传入时只用这份（标的页只允许选本标的的剧本）；
   * 不传则回落到全量剧本列表（账单页跨标的记账）。
   */
  plans?: PlanLite[];
}>();

const KIND = '想法' as const;
const PLACEHOLDER =
  '可留空。想写就写下单当时在想什么：赌的是哪个逻辑、为什么是这个价位和这个张数。用当时的原话，不做事后润色。';

const loading = ref(false);
const saving = ref(false);
/** 已落库的那条「想法」 */
const stored = ref<Api.Bills.BillNote | null>(null);
/** 编辑中的「想法」正文 */
const draft = ref('');

/** 全量剧本下拉选项（未暂停） */
const planOptions = ref<Array<{ label: string; value: number }>>([]);
/** 选中的剧本 id（null=未关联）；回显自「想法」note 的 plan_id */
const selectedPlanId = ref<number | null>(null);

/** 是否有未保存的改动：想法与剧本两项都算 */
const hasDirty = computed(() => {
  return (
    draft.value.trim() !== (stored.value?.content ?? '').trim() ||
    selectedPlanId.value !== (stored.value?.plan_id ?? null)
  );
});

/** 下拉选项：传入 plans 时只映射这份，保证不跨标的 */
function buildOptions(list: PlanLite[]) {
  planOptions.value = list
    .filter(p => !p.is_cancelled)
    .map(p => ({
      value: p.id,
      label: `${p.vm_symbol} ${p.trade_symbol} ${p.b_s}${p.o_c || ''} — ${(p.reason || p.trigger_op || '').slice(0, 14)}`
    }));
}

async function loadPlans() {
  if (props.plans) {
    buildOptions(props.plans);
    return;
  }
  const { data, error } = await fetchAllPlans();
  if (!error && data) buildOptions(data);
}
onMounted(loadPlans);
watch(() => props.plans, loadPlans);

async function load() {
  if (props.billId == null) {
    stored.value = null;
    draft.value = '';
    selectedPlanId.value = null;
    return;
  }
  loading.value = true;
  try {
    const { data, error } = await fetchBillNotes(props.billId);
    // 复盘已不再挂在成交上，历史行里若还有「复盘」也不进「想法」编辑框
    const idea = error || !data ? null : (data.find(n => n.kind === KIND) ?? null);
    stored.value = idea;
    draft.value = idea?.content ?? '';
    // 剧本关联回显
    selectedPlanId.value = idea?.plan_id ?? null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.billId, load, { immediate: true });

/** 落笔时间文案：未写过返回空 */
const atText = computed(() => (stored.value?.content_at ? stored.value.content_at.replace('T', ' ').slice(0, 16) : ''));

/**
 * 晚于成交多少天落笔：≥1 天才提示，≥7 天标橙。
 *
 * 这是「事后补写」的唯一可算信号——文本看不出来，时间戳能。
 */
const lateDays = computed<number | null>(() => {
  const at = stored.value?.content_at;
  if (!at || !props.tradeTime) return null;
  const a = new Date(at.replace(' ', 'T')).getTime();
  const b = new Date(props.tradeTime.replace(' ', 'T')).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.floor((a - b) / 86400000);
  return days >= 1 ? days : null;
});

/**
 * 整体保存「想法 + 剧本关联」，由外层弹窗的「保存」按钮调用。
 * 返回是否保存成功，外层据此决定是否关闭弹窗。
 *
 * 两项都为空时后端会删除该条笔记；只选剧本时允许正文为空。
 */
async function save(): Promise<boolean> {
  if (props.billId == null) return false;
  saving.value = true;
  try {
    const { data, error } = await saveBillNote(props.billId, KIND, draft.value, selectedPlanId.value);
    if (error) return false;
    window.$message?.success(data?.action === 'deleted' ? '已清空该笔笔记' : '已保存');
    return true;
  } finally {
    saving.value = false;
  }
}

defineExpose({ save });
</script>

<template>
  <div>
    <div class="mb-12px flex items-center gap-8px">
      <span class="shrink-0 text-12px text-gray-500">执行剧本</span>
      <NSelect
        :value="selectedPlanId"
        :options="planOptions"
        placeholder="这条笔记执行了哪条剧本（可选）"
        filterable
        size="small"
        class="flex-1"
        @update:value="selectedPlanId = $event"
      />
    </div>
    <NSpin :show="loading">
      <div class="mb-12px">
        <div class="mb-4px flex flex-wrap items-center gap-8px">
          <span class="font-500">想法</span>
          <span class="text-12px text-gray-400">可留空</span>
          <span v-if="atText" class="text-12px text-gray-400">落笔 {{ atText }}</span>
          <NTag v-if="lateDays !== null" size="tiny" :type="lateDays >= 7 ? 'warning' : 'default'" :bordered="false">
            晚 {{ lateDays }} 天补写
          </NTag>
        </div>
        <NInput
          v-model:value="draft"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="PLACEHOLDER"
        />
      </div>
      <NAlert v-if="hasDirty" type="warning" :bordered="false" :show-icon="false">
        有未保存的改动：想法与剧本不会自动提交，请点下方「保存」。
      </NAlert>
    </NSpin>
  </div>
</template>
