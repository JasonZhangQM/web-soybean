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
 * 3. **空串 = 删除**：清空后保存会把这条笔记删掉，不留空壳。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NAlert } from 'naive-ui';
import { fetchBillNotes, saveBillNote, fetchAllPlans } from '@/service/api';

defineOptions({ name: 'BillNotePanel' });

const props = defineProps<{
  /** 成交 ID；null = 弹窗还没选中行 */
  billId: number | null;
  /** 成交时间（yyyy-MM-dd HH:mm:ss），用于判断笔记是不是事后补写 */
  tradeTime?: string | null;
  /** 归属标的（显示在标题里，让「这笔在赌什么」一眼可见） */
  vmSymbol?: string | null;
}>();

const KIND = '想法' as const;
const PLACEHOLDER = '下单当时在想什么：赌的是哪个逻辑、为什么是这个价位和这个张数。用当时的原话，不做事后润色。';

const loading = ref(false);
const saving = ref(false);
/** 已落库的那条「想法」 */
const stored = ref<Api.Bills.BillNote | null>(null);
/** 编辑中的「想法」正文 */
const draft = ref('');
/** 是否有未保存的改动（用于提示） */
const hasDirty = computed(() => draft.value !== (stored.value?.content ?? ''));

/** 全量剧本下拉选项（未暂停） */
const planOptions = ref<Array<{ label: string; value: number }>>([]);
/** 选中的剧本 id（null=未关联）；回显自「想法」note 的 plan_id */
const selectedPlanId = ref<number | null>(null);

async function loadPlans() {
  const { data, error } = await fetchAllPlans();
  if (!error && data) {
    planOptions.value = data
      .filter(p => !p.is_cancelled)
      .map(p => ({
        value: p.id,
        label: `${p.vm_symbol} ${p.trade_symbol} ${p.b_s}${p.o_c || ''} — ${(p.reason || p.trigger_op).slice(0, 14)}`
      }));
  }
}
onMounted(loadPlans);

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

async function handleSave() {
  if (props.billId == null) return;
  saving.value = true;
  try {
    // 空串即删除（后端语义），不要在前端「改成不传」——那是两回事
    const { data, error } = await saveBillNote(props.billId, KIND, draft.value, selectedPlanId.value);
    if (!error) {
      window.$message?.success(data?.action === 'deleted' ? '已删除想法' : '想法已保存');
      await load();
    }
  } finally {
    saving.value = false;
  }
}

/** 切换剧本关联：已有「想法」文本时即时落库，否则等写想法时随「保存想法」一并提交 */
async function handlePlanChange(value: number | null) {
  selectedPlanId.value = value;
  if (!draft.value) return;
  if (value === (stored.value?.plan_id ?? null)) return;
  saving.value = true;
  try {
    const { error } = await saveBillNote(props.billId as number, KIND, draft.value, value);
    if (!error) await load();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div v-if="vmSymbol" class="mb-8px text-12px text-gray-500">
      归属标的：
      <span class="text-primary">{{ vmSymbol }}</span>
    </div>
    <div class="mb-8px text-12px text-gray-400">复盘已移到标的层（标的档案 → 复盘），这里只记成交当时的想法</div>
    <div class="mb-12px flex items-center gap-8px">
      <span class="shrink-0 text-12px text-gray-500">执行剧本</span>
      <NSelect
        :value="selectedPlanId"
        :options="planOptions"
        placeholder="这条笔记执行了哪条剧本（可选）"
        filterable
        size="small"
        class="flex-1"
        @update:value="handlePlanChange"
      />
    </div>
    <NSpin :show="loading">
      <div class="mb-12px">
        <div class="mb-4px flex flex-wrap items-center gap-8px">
          <span class="font-500">想法</span>
          <span v-if="atText" class="text-12px text-gray-400">落笔 {{ atText }}</span>
          <NTag v-if="lateDays !== null" size="tiny" :type="lateDays >= 7 ? 'warning' : 'default'" :bordered="false">
            晚 {{ lateDays }} 天补写
          </NTag>
          <NButton
            size="tiny"
            type="primary"
            ghost
            class="ml-auto"
            :loading="saving"
            :disabled="!hasDirty"
            @click="handleSave"
          >
            保存想法
          </NButton>
        </div>
        <NInput
          v-model:value="draft"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="PLACEHOLDER"
        />
      </div>
      <NAlert v-if="hasDirty" type="warning" :bordered="false" :show-icon="false">
        有未保存的笔记改动：笔记不随「保存」按钮一起提交，请点上面的「保存想法」。
      </NAlert>
    </NSpin>
  </div>
</template>
