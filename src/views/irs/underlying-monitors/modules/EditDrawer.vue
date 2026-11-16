<script setup lang="ts">
/**
 * 标的监测「新增 / 编辑」抽屉（2026-11-16 从 underlying-monitors/index.vue 抽出）
 *
 * 背景：/risk 的标的档案抽屉点「编辑标的信息」原先只能 router.push 到
 * /irs/underlying-monitors?um=SYMBOL —— 那个参数只会开档案抽屉，编辑弹窗又只长在
 * 列表页里，于是用户还得再点一次编辑。现在两页共用本组件，/risk 原地弹出、不跳页。
 *
 * 职责边界：表单状态、校验、新增/修改/删除全在这里；列表刷新、推演重算、档案抽屉
 * 的开关都由宿主决定 —— 组件只 emit('changed')，不碰宿主的任何 ref。
 *
 * - row = null ⇒ 新增模式（目前只有标的监测列表页用）；row 非 null ⇒ 编辑模式；
 * - themeOptions 传了就复用宿主的候选（列表页筛选区已有）；不传则打开时自拉一次全量；
 * - allowDelete 默认 true，/risk 是只读看板页，传 false 不放破坏性操作入口。
 *
 * ⚠️ 修改只提交 name / theme / 行情字段，**不碰五档**：档位版本去档案抽屉「档位」Tab 改。
 * 行情字段是 PATCH 语义（仅非 None 才更新），且只有折叠面板展开时才带上，
 * 避免「只改个名称」把 gm 同步来的行情误清空。
 */
import { computed, reactive, ref, watch } from 'vue';
import {
  createUnderlyingMonitor,
  deleteUnderlyingMonitor,
  fetchUnderlyingMonitors,
  updateUnderlyingMonitor
} from '@/service/api';
import { useSymbolSearch } from '@/hooks/common/symbol-search';

defineOptions({ name: 'UnderlyingEditDrawer' });

type SelectOption = { label: string; value: string };
type ChangedPayload = { deleted: boolean; symbol: string };

const props = defineProps<{
  show: boolean;
  /** null = 新增模式；非 null = 编辑模式（回填这一行） */
  row: Api.Irs.UnderlyingMonitor | null;
  /** 主题候选：列表页复用筛选区那份；不传则组件自己拉一次全量（不受筛选影响） */
  themeOptions?: SelectOption[];
  /** 是否显示「删除」：看板页传 false */
  allowDelete?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  /** 保存 / 删除成功：宿主按自己的口径刷新列表、重算推演、更新档案抽屉 */
  (e: 'changed', payload: ChangedPayload): void;
}>();

const visible = computed({
  get: () => props.show,
  set: v => emit('update:show', v)
});

const allowDelete = computed(() => props.allowDelete !== false);

const submitLoading = ref(false);
const formRef = ref();
const editingId = ref<number | null>(null);
const formData = reactive({
  symbol: '',
  name: '',
  theme: '' as string | null,
  // 行情字段（兜底编辑，默认折叠）
  py_close: null as number | null,
  y_high: null as number | null,
  y_low: null as number | null,
  price: null as number | null
});

/** 行情折叠面板展开状态：默认折叠，仅编辑模式显示 */
const quoteExpandedNames = ref<string[]>([]);

/** 代码远程搜索：NSelect remote，防抖 300ms 调 /bds/symbol-infos */
const { symbolOptions, symbolLoading, handleSymbolSearch, clearSymbolOptions, getNameBySymbol } = useSymbolSearch();

/** 未传候选时自拉一份全量主题（与列表页筛选区同源，不受当前筛选影响） */
const innerThemeOptions = ref<SelectOption[]>([]);
const themeOpts = computed(() => props.themeOptions ?? innerThemeOptions.value);

async function loadThemeOptions() {
  if (props.themeOptions) return;
  const { data, error } = await fetchUnderlyingMonitors({ limit: 200 });
  if (!error && data) {
    innerThemeOptions.value = Array.from(new Set(data.items.map(i => i.theme).filter((t): t is string => !!t)))
      .sort()
      .map(t => ({ label: t, value: t }));
  }
}

const modalTitle = computed(() => (editingId.value === null ? '新增标的监测' : '编辑标的监测'));

const formRules = {
  symbol: { required: true, message: '请选择代码', trigger: 'change' },
  name: { required: true, message: '请输入名称', trigger: 'blur' }
};

function resetForm() {
  editingId.value = null;
  formData.symbol = '';
  formData.name = '';
  formData.theme = null;
  formData.py_close = null;
  formData.y_high = null;
  formData.y_low = null;
  formData.price = null;
  quoteExpandedNames.value = [];
  clearSymbolOptions();
  formRef.value?.restoreValidation();
}

/** 打开时才回填/清空：宿主页只需设 show + row，不必再调一次 reset */
watch(
  () => props.show,
  show => {
    if (!show) return;
    resetForm();
    if (props.row) {
      const row = props.row;
      editingId.value = row.id;
      formData.symbol = row.symbol;
      formData.name = row.name ?? '';
      formData.theme = row.theme ?? null;
      // 编辑回填时 NSelect 需有对应 option 才能显示，手动塞入当前行
      symbolOptions.value = [{ label: `${row.symbol} ${row.name ?? ''}`, value: row.symbol }];
      formData.py_close = row.py_close != null ? Number(row.py_close) : null;
      formData.y_high = row.y_high != null ? Number(row.y_high) : null;
      formData.y_low = row.y_low != null ? Number(row.y_low) : null;
      formData.price = row.price != null ? Number(row.price) : null;
    }
    void loadThemeOptions();
  },
  { immediate: true }
);

/** 选择代码后自动回填名称（仅新增模式触发；编辑模式 symbol 禁用不会变） */
function handleSymbolChange(symbol: string | null) {
  formData.symbol = symbol ?? '';
  if (symbol && editingId.value === null) {
    const name = getNameBySymbol(symbol);
    if (name) formData.name = name;
  }
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  submitLoading.value = true;
  try {
    let error;
    if (editingId.value === null) {
      // 新增：只传基础字段，档位版本后续去档案抽屉的「档位」Tab 建
      ({ error } = await createUnderlyingMonitor({
        symbol: formData.symbol,
        name: formData.name,
        theme: formData.theme || null
      }));
    } else {
      const quoteExpanded = quoteExpandedNames.value.includes('quote');
      ({ error } = await updateUnderlyingMonitor(editingId.value, {
        name: formData.name,
        theme: formData.theme || null,
        ...(quoteExpanded
          ? {
              py_close: formData.py_close,
              y_high: formData.y_high,
              y_low: formData.y_low,
              price: formData.price
            }
          : {})
      }));
    }
    if (!error) {
      window.$message?.success(editingId.value === null ? '新增成功' : '修改成功');
      visible.value = false;
      emit('changed', { deleted: false, symbol: formData.symbol });
    }
  } finally {
    submitLoading.value = false;
  }
}

function handleCancel() {
  visible.value = false;
}

/**
 * 删除：先调 DELETE 不带 cascade — 有子数据后端返回 409 + 各子表计数，
 * 前端把代价摆在确认框里；确认后带 cascade=true 再删。
 * 不再走 detail 接口取计数（detail 已瘦身，不再返回各子表数组）。
 */
async function handleDelete() {
  if (editingId.value === null) return;
  const id = editingId.value;
  const symbol = formData.symbol;
  submitLoading.value = true;
  try {
    // 第一次尝试：不 cascade
    const { data, error } = await deleteUnderlyingMonitor(id, false);
    if (!error && data) {
      window.$message?.success('删除成功');
      visible.value = false;
      emit('changed', { deleted: true, symbol });
      return;
    }
    // 后端返回 409：解析 counts 构建确认框
    const detailObj = (error as any)?.response?.data?.detail;
    const counts: Record<string, number> = detailObj?.counts ?? {};
    const hasChild = Object.values(counts).some(n => n > 0);
    if (!hasChild) return;

    const labelMap: Record<string, string> = {
      version: '档位版本',
      research: '研究版本',
      logic: '投资逻辑',
      invalidate: '证伪条件',
      plan: '剧本'
    };
    const detailText = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${labelMap[k] ?? k} ${n} 条`)
      .join('、');

    window.$dialog?.warning({
      title: `标的还有档案：${detailText}`,
      content: '删除会连同上面这些档案一起清空（成交笔记不会删——它挂的是成交，不是标的）。这一步不可恢复，确认继续？',
      positiveText: '确认删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        const res = await deleteUnderlyingMonitor(id, true);
        if (!res.error) {
          window.$message?.success('删除成功');
          visible.value = false;
          emit('changed', { deleted: true, symbol });
        }
      }
    });
  } finally {
    submitLoading.value = false;
  }
}
</script>

<template>
  <!-- 档案抽屉在右（72%），本抽屉在左（520px）：两页都是同一套叠层，关掉编辑即回到档案 -->
  <NDrawer v-model:show="visible" placement="left" width="520px" :mask-closable="false">
    <NDrawerContent :title="modalTitle" closable :native-scrollbar="false">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="90px">
        <NFormItem label="代码" path="symbol">
          <NSelect
            :value="formData.symbol || null"
            :options="symbolOptions"
            :loading="symbolLoading"
            :disabled="editingId !== null"
            filterable
            remote
            clearable
            placeholder="输入代码或名称搜索"
            style="width: 100%"
            @search="handleSymbolSearch"
            @update:value="handleSymbolChange"
          />
        </NFormItem>
        <NFormItem label="名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入名称" />
        </NFormItem>
        <NFormItem label="主题">
          <NSelect
            v-model:value="formData.theme"
            :options="themeOpts"
            filterable
            tag
            clearable
            placeholder="黄金 / IC贴水 / 红利…（可输入新标签，跨合约聚合用）"
            style="width: 100%"
          />
        </NFormItem>
        <!-- 行情字段：仅编辑模式显示，默认折叠，展开后可兜底编辑 -->
        <NCollapse v-if="editingId !== null" v-model:expanded-names="quoteExpandedNames" class="mt-8px">
          <NCollapseItem title="行情字段（兜底编辑）" name="quote">
            <NFormItem label="上年末" path="py_close">
              <NInputNumber
                v-model:value="formData.py_close"
                :precision="4"
                :step="0.0001"
                placeholder="上年末收盘价"
                class="w-full"
              />
            </NFormItem>
            <NFormItem label="年高" path="y_high">
              <NInputNumber
                v-model:value="formData.y_high"
                :precision="4"
                :step="0.0001"
                placeholder="年度最高价"
                class="w-full"
              />
            </NFormItem>
            <NFormItem label="年低" path="y_low">
              <NInputNumber
                v-model:value="formData.y_low"
                :precision="4"
                :step="0.0001"
                placeholder="年度最低价"
                class="w-full"
              />
            </NFormItem>
            <NFormItem label="最新价" path="price">
              <NInputNumber
                v-model:value="formData.price"
                :precision="4"
                :step="0.0001"
                placeholder="最新成交价"
                class="w-full"
              />
            </NFormItem>
          </NCollapseItem>
        </NCollapse>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleCancel">取消</NButton>
          <NButton :loading="submitLoading" @click="handleSubmit">
            {{ editingId === null ? '确定' : '修改' }}
          </NButton>
          <NButton v-if="allowDelete && editingId !== null" :loading="submitLoading" @click="handleDelete">
            删除
          </NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
