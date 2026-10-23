<script setup lang="ts">
/**
 * 单笔成交的交易笔记（想法 / 复盘）
 *
 * 设计要点（对应方案 v3 §7.2）：
 * 1. **独立端点**：保存走 `PUT /bills/bills/{id}/note/{kind}`，不混进 36 字段的
 *    `PATCH /bills/bills/{id}` —— 那是宽口子，一旦有人给它加「回写全列」，
 *    笔记会被静默冲成 NULL。
 * 2. **`content_at` 只读**：后端在首次写入时打，前端不可传。否则「当时写的」可以被
 *    伪造，反自欺就失效了。这里也据此算出「晚 N 天补写」并标黄。
 * 3. **空串 = 删除**：清空后保存会把这条笔记删掉，不留空壳。
 */
import { ref, computed, watch } from 'vue';
import { NAlert } from 'naive-ui';
import { fetchBillNotes, saveBillNote, type BillNoteKind } from '@/service/api';

defineOptions({ name: 'BillNotePanel' });

const props = defineProps<{
  /** 成交 ID；null = 弹窗还没选中行 */
  billId: number | null;
  /** 成交时间（yyyy-MM-dd HH:mm:ss），用于判断笔记是不是事后补写 */
  tradeTime?: string | null;
  /** 归属标的（显示在标题里，让「这笔在赌什么」一眼可见） */
  vmSymbol?: string | null;
}>();

/** 两种笔记的元信息：kind 是后端枚举值，不要改文案 */
const KINDS: Array<{ kind: BillNoteKind; label: string; placeholder: string }> = [
  {
    kind: '想法',
    label: '想法',
    placeholder: '下单当时在想什么：赌的是哪个逻辑、为什么是这个价位和这个张数。用当时的原话，不做事后润色。'
  },
  {
    kind: '复盘',
    label: '复盘',
    placeholder: '事后回看：判断对不对、执行有没有走样、下次改什么。平仓或阶段回看时写。'
  }
];

const loading = ref(false);
const savingKind = ref<BillNoteKind | null>(null);
/** kind -> 已落库的那条笔记 */
const stored = ref<Record<string, Api.Bills.BillNote>>({});
/** 两个 textarea 的编辑值（分开存，互不干扰） */
const drafts = ref<Record<string, string>>({ 想法: '', 复盘: '' });
/** 是否有未保存的改动（用于关弹窗前提醒） */
const dirty = ref<Record<string, boolean>>({ 想法: false, 复盘: false });

const hasDirty = computed(() => Object.values(dirty.value).some(Boolean));

async function load() {
  if (props.billId == null) {
    stored.value = {};
    drafts.value = { 想法: '', 复盘: '' };
    dirty.value = { 想法: false, 复盘: false };
    return;
  }
  loading.value = true;
  try {
    const { data, error } = await fetchBillNotes(props.billId);
    const map: Record<string, Api.Bills.BillNote> = {};
    if (!error && data) {
      for (const n of data) map[n.kind] = n;
    }
    stored.value = map;
    drafts.value = { 想法: map['想法']?.content ?? '', 复盘: map['复盘']?.content ?? '' };
    dirty.value = { 想法: false, 复盘: false };
  } finally {
    loading.value = false;
  }
}

watch(() => props.billId, load, { immediate: true });

/** 落笔时间文案：未写过返回空 */
function atText(kind: BillNoteKind) {
  const at = stored.value[kind]?.content_at;
  return at ? at.replace('T', ' ').slice(0, 16) : '';
}

/**
 * 晚于成交多少天落笔：≥1 天才提示，≥7 天标橙。
 *
 * 这是「事后补写」的唯一可算信号——文本看不出来，时间戳能。
 */
function lateDays(kind: BillNoteKind): number | null {
  const at = stored.value[kind]?.content_at;
  if (!at || !props.tradeTime) return null;
  const a = new Date(at.replace(' ', 'T')).getTime();
  const b = new Date(props.tradeTime.replace(' ', 'T')).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.floor((a - b) / 86400000);
  return days >= 1 ? days : null;
}

async function handleSave(kind: BillNoteKind) {
  if (props.billId == null) return;
  savingKind.value = kind;
  try {
    // 空串即删除（后端语义），不要在前端「改成不传」——那是两回事
    const { data, error } = await saveBillNote(props.billId, kind, drafts.value[kind] ?? '');
    if (!error) {
      window.$message?.success(data?.action === 'deleted' ? `已删除${kind}` : `${kind}已保存`);
      dirty.value[kind] = false;
      await load();
    }
  } finally {
    savingKind.value = null;
  }
}

function handleInput(kind: BillNoteKind, val: string) {
  drafts.value[kind] = val;
  dirty.value[kind] = val !== (stored.value[kind]?.content ?? '');
}

defineExpose({ hasDirty });
</script>

<template>
  <div>
    <div v-if="vmSymbol" class="mb-8px text-12px text-gray-500">
      归属标的：
      <span class="text-primary">{{ vmSymbol }}</span>
    </div>
    <NSpin :show="loading">
      <div v-for="item in KINDS" :key="item.kind" class="mb-12px">
        <div class="mb-4px flex flex-wrap items-center gap-8px">
          <span class="font-500">{{ item.label }}</span>
          <span v-if="atText(item.kind)" class="text-12px text-gray-400">落笔 {{ atText(item.kind) }}</span>
          <NTag
            v-if="lateDays(item.kind) !== null"
            size="tiny"
            :type="(lateDays(item.kind) as number) >= 7 ? 'warning' : 'default'"
            :bordered="false"
          >
            晚 {{ lateDays(item.kind) }} 天补写
          </NTag>
          <NButton
            size="tiny"
            type="primary"
            ghost
            class="ml-auto"
            :loading="savingKind === item.kind"
            :disabled="!dirty[item.kind]"
            @click="handleSave(item.kind)"
          >
            保存{{ item.label }}
          </NButton>
        </div>
        <NInput
          :value="drafts[item.kind]"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="item.placeholder"
          @update:value="(v: string) => handleInput(item.kind, v)"
        />
      </div>
      <NAlert v-if="hasDirty" type="warning" :bordered="false" :show-icon="false">
        有未保存的笔记改动：笔记不随「保存」按钮一起提交，请点上面的「保存想法 / 保存复盘」。
      </NAlert>
    </NSpin>
  </div>
</template>
