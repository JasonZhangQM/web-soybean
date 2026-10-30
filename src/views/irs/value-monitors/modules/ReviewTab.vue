<script setup lang="ts">
/**
 * 复盘 Tab（标的层）
 *
 * 复盘回答的是「这版研究的结论兑现了没有」，所以每条复盘都必须锚定一版研究
 * （`research_id` → `irs_vm_research`）；同一版本可以多次复盘，落笔日期
 * `review_date` 由后端填，前端不可传。
 */
import { computed, onMounted, ref } from 'vue';
import {
  createVmReview,
  deleteVmReview,
  fetchVmResearch,
  fetchVmReviews,
  updateVmReview,
  type VmReview
} from '@/service/api';

defineOptions({ name: 'VmReviewTab' });

const props = defineProps<{ vmId: number; symbol: string }>();
const emit = defineEmits<{ (e: 'dirty'): void }>();

const loading = ref(false);
const saving = ref(false);
const deletingId = ref<number | null>(null);
/** 复盘列表（后端已按 review_date 倒序） */
const reviews = ref<VmReview[]>([]);
/** 可锚定的研究版本（research_date 倒序） */
const researchList = ref<Api.Irs.VmResearch[]>([]);

const showModal = ref(false);
/** null = 新建；否则为被编辑的复盘 id */
const editingId = ref<number | null>(null);
const form = ref<{ research_id: number | null; content: string }>({ research_id: null, content: '' });

const researchById = computed(() => new Map(researchList.value.map(r => [r.id, r])));

const researchOptions = computed(() =>
  researchList.value.map(r => ({
    value: r.id,
    label: r.conclusion ? `${r.research_date} · ${r.conclusion}` : r.research_date
  }))
);

/** 从 axios 错误体里取 FastAPI 的 detail */
function detailOf(error: unknown): string {
  const err = error as { response?: { data?: { detail?: string } } };
  return err?.response?.data?.detail ?? '';
}

/** 版本标识：优先日期，版本被删/查不到时退回 id */
function versionLabel(researchId: number) {
  const r = researchById.value.get(researchId);
  return r ? `研究 ${r.research_date}` : `研究 #${researchId}`;
}

function versionSummary(researchId: number) {
  return researchById.value.get(researchId)?.conclusion ?? '';
}

async function load() {
  loading.value = true;
  try {
    const { data, error } = await fetchVmReviews(props.vmId);
    if (error) {
      window.$message?.error(detailOf(error) || '复盘加载失败');
      return;
    }
    reviews.value = data ?? [];
  } finally {
    loading.value = false;
  }
}

async function loadResearch() {
  const { data, error } = await fetchVmResearch(props.vmId);
  if (error) {
    window.$message?.error(detailOf(error) || '研究版本加载失败');
    return;
  }
  researchList.value = data ?? [];
}

onMounted(() => {
  load();
  loadResearch();
});

function openNew() {
  if (!researchList.value.length) {
    window.$message?.warning('还没有研究版本：复盘必须锚定一版研究，请先去「研究」tab 写一版');
    return;
  }
  editingId.value = null;
  // 默认锚定最新一版（researchList 已是 research_date 倒序）
  form.value = { research_id: researchList.value[0].id, content: '' };
  showModal.value = true;
}

function openEdit(r: VmReview) {
  editingId.value = r.id;
  form.value = { research_id: r.research_id, content: r.content };
  showModal.value = true;
}

async function handleSave() {
  if (form.value.research_id == null) {
    window.$message?.warning('请选择这条复盘锚定的研究版本');
    return;
  }
  const content = form.value.content.trim();
  if (!content) {
    window.$message?.warning('复盘正文不能为空');
    return;
  }
  saving.value = true;
  try {
    const params = { research_id: form.value.research_id, content };
    const { error } =
      editingId.value == null
        ? await createVmReview(props.vmId, params)
        : await updateVmReview(editingId.value, params);
    if (error) {
      window.$message?.error(detailOf(error) || '复盘保存失败');
      return;
    }
    window.$message?.success(editingId.value == null ? '复盘已保存' : '复盘已更新');
    showModal.value = false;
    await load();
    emit('dirty');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(r: VmReview) {
  deletingId.value = r.id;
  try {
    const { error } = await deleteVmReview(r.id);
    if (error) {
      window.$message?.error(detailOf(error) || '复盘删除失败');
      return;
    }
    window.$message?.success('已删除该条复盘');
    await load();
    emit('dirty');
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div>
    <div class="mb-12px flex flex-wrap items-center gap-8px">
      <span class="text-12px text-gray-400">复盘回答的是：这版研究的结论兑现了没有；同一版本可多次复盘</span>
      <span class="ml-auto text-12px text-gray-400">{{ symbol }}</span>
      <NButton size="tiny" ghost :disabled="!researchList.length" @click="openNew">写复盘</NButton>
    </div>

    <NAlert v-if="!researchList.length" type="warning" :bordered="false" :show-icon="false" class="mb-12px">
      这个标的还没有研究版本：复盘必须锚定一版研究，请先去「研究」tab 写一版。
    </NAlert>

    <NSpin :show="loading">
      <NEmpty
        v-if="!loading && !reviews.length"
        size="small"
        description="还没有复盘。复盘要回答的是：这版研究的结论兑现了没有。"
        class="my-8px"
      />
      <div v-for="r in reviews" :key="r.id" class="mb-8px rounded-4px border border-gray-200 border-solid p-12px">
        <div class="flex flex-wrap items-center gap-8px">
          <NTag size="small" :bordered="false" type="info">{{ versionLabel(r.research_id) }}</NTag>
          <span v-if="versionSummary(r.research_id)" class="text-12px text-gray-400">
            {{ versionSummary(r.research_id) }}
          </span>
          <span class="text-12px text-gray-400">落笔 {{ r.review_date }}</span>
          <div class="ml-auto flex gap-8px">
            <NButton text size="tiny" type="primary" @click="openEdit(r)">编辑</NButton>
            <NPopconfirm @positive-click="handleDelete(r)">
              <template #trigger>
                <NButton text size="tiny" type="error" :loading="deletingId === r.id">删除</NButton>
              </template>
              删除这条复盘？同一研究版本的其他复盘不受影响。
            </NPopconfirm>
          </div>
        </div>
        <div class="mt-8px whitespace-pre-wrap text-13px">{{ r.content }}</div>
      </div>
    </NSpin>

    <!-- 写复盘抽屉（左侧），与逻辑/证伪抽屉同规格 -->
    <NDrawer v-model:show="showModal" placement="left" width="520px" :mask-closable="false">
      <NDrawerContent :title="editingId == null ? '写复盘' : '编辑复盘'" closable :native-scrollbar="false">
        <NForm label-placement="top" :show-feedback="false">
          <NFormItem label="研究版本" required>
            <NSelect
              v-model:value="form.research_id"
              :options="researchOptions"
              filterable
              placeholder="选这条复盘锚定的研究版本"
            />
          </NFormItem>
          <NFormItem label="复盘正文" required>
            <NInput
              v-model:value="form.content"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 10 }"
              placeholder="这版研究的结论兑现了没有：哪些兑现、哪些没兑现、下一步怎么办"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showModal = false">取消</NButton>
            <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
