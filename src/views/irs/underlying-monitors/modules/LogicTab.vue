<script setup lang="ts">
/**
 * 投资逻辑（2026-11-09 起并入「研究与复盘」Tab，不再是顶层 TabPane）
 *
 * 两条数据模型事实决定了这里的交互：
 * 1. **不是版本化的**：`irs_um_logic` 的唯一键是 (symbol, seq)，只有当前态，
 *    不像研究那样按日期留史。所以这里改的是"现在怎么认为"，不是"当时怎么认为"。
 * 2. **改 state 是周级动作**：复盘第一步就是"哪条逻辑坏了"。所以状态做成表格里的行内下拉，
 *    点一下即存，不进弹窗（进弹窗要多三次点击，高频动作不能这么贵）。
 *
 * ⚠️ 行内改状态必须回填其余字段：`PUT /logic` 是**全字段覆盖**（后端无条件
 * `row.content = payload.content`），只传 seq+state 会把 content 写成空串。
 *
 * 证伪条件已于 2026-11-27 删除（只在研报文件中维护），`irs_um_invalidate`
 * 表与相关 API 已随 DDL 一并移除。
 */
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton, NSelect, NTag } from 'naive-ui';
import {
  fetchUnderlyingLogic,
  saveUnderlyingLogic,
  deleteUnderlyingLogic,
  type UnderlyingLogicSaveParams
} from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import SectionBar from './SectionBar.vue';

defineOptions({ name: 'UnderlyingLogicTab' });

const props = defineProps<{ umId: number; symbol: string }>();
const emit = defineEmits<{ (e: 'dirty'): void }>();

// 自管数据（懒加载，切到本 Tab 时 onMounted 拉）
const logic = ref<Api.Irs.UnderlyingLogic[]>([]);

async function loadLogic() {
  const { data, error } = await fetchUnderlyingLogic(props.umId);
  if (!error && data) logic.value = data;
}
onMounted(loadLogic);

/** 状态取值以 `models.UnderlyingLogic.STATE_CHOICES` 为准；这里曾写成「受损」，会让按 state 聚合漏数 */
const STATE_OPTIONS = [
  { value: '完好', label: '完好' },
  { value: '减弱', label: '减弱' },
  { value: '破坏', label: '破坏' }
];
const PRICING_OPTIONS = [
  { value: '未定价', label: '未定价' },
  { value: '部分', label: '部分' },
  { value: '已充分', label: '已充分' }
];

const saving = ref(false);
const deletingLogicSeq = ref<number | null>(null);
/** 正在改状态的 seq（同一行下拉显示 loading） */
const stateSavingSeq = ref<number | null>(null);
/**
 * 状态草稿：提交后到 `refresh` 回来之间，避免下拉弹回旧值造成闪烁。
 * 用 Map 而不是普通对象，是因为要在失败时删除键——`delete obj[key]` 过不了
 * `@typescript-eslint/no-dynamic-delete`，且 Map 的增删天然是响应式的。
 */
const stateDraft = ref(new Map<number, string>());

// ---------------------------------------------------------------- 投资逻辑
const showLogicModal = ref(false);

const logicForm = reactive<{
  seq: number;
  content: string;
  pricing: string | null;
  state: string;
  evidence: string;
}>({ seq: 1, content: '', pricing: null, state: '完好', evidence: '' });

function openLogicNew() {
  const maxSeq = logic.value.reduce((m, l) => Math.max(m, l.seq), 0);
  logicForm.seq = maxSeq + 1;
  logicForm.content = '';
  logicForm.pricing = null;
  logicForm.state = '完好';
  logicForm.evidence = '';
  showLogicModal.value = true;
}

function openLogicEdit(row: Api.Irs.UnderlyingLogic) {
  logicForm.seq = row.seq;
  logicForm.content = row.content;
  logicForm.pricing = row.pricing;
  logicForm.state = row.state;
  logicForm.evidence = row.evidence ?? '';
  showLogicModal.value = true;
}

async function saveLogic() {
  if (!logicForm.content.trim()) {
    window.$message?.warning('逻辑不能为空——写清「逻辑 → 影响路径 → 是否已定价」');
    return;
  }
  saving.value = true;
  try {
    const payload: UnderlyingLogicSaveParams = {
      seq: logicForm.seq,
      content: logicForm.content.trim(),
      pricing: logicForm.pricing,
      state: logicForm.state,
      evidence: logicForm.evidence.trim() || null
    };
    const { data, error } = await saveUnderlyingLogic(props.umId, payload);
    if (!error) {
      if (data?.warning) window.$message?.warning(data.warning);
      else window.$message?.success(data?.action === 'created' ? '已新增一条逻辑' : '已保存');
      showLogicModal.value = false;
      await loadLogic();
      emit('dirty');
    }
  } finally {
    saving.value = false;
  }
}

/** 行内改状态：立刻落库（有 state_at 留痕，改错能改回，所以不做二次确认） */
async function changeLogicState(row: Api.Irs.UnderlyingLogic, state: string) {
  if (!state || state === row.state) return;
  stateDraft.value.set(row.seq, state);
  stateSavingSeq.value = row.seq;
  try {
    // 全字段回填：后端无条件覆盖 content/pricing/evidence，漏了就清空
    const { error } = await saveUnderlyingLogic(props.umId, {
      seq: row.seq,
      content: row.content,
      pricing: row.pricing,
      state,
      evidence: row.evidence
    });
    if (error) {
      stateDraft.value.delete(row.seq);
      return;
    }
    window.$message?.success(`第 ${row.seq} 条状态改为「${state}」`);
    await loadLogic();
    emit('dirty');
  } finally {
    stateSavingSeq.value = null;
  }
}

function handleDeleteLogic(row: Api.Irs.UnderlyingLogic) {
  window.$dialog?.warning({
    title: `删除第 ${row.seq} 条逻辑？`,
    content: '删了就查不到当时怎么想的。如果只是这条逻辑坏了，把状态改成「破坏」比删除好。',
    positiveText: '仍要删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingLogicSeq.value = row.seq;
      try {
        const { error } = await deleteUnderlyingLogic(props.umId, row.seq);
        if (!error) {
          window.$message?.success('已删除');
          await loadLogic();
          emit('dirty');
        }
      } finally {
        deletingLogicSeq.value = null;
      }
    }
  });
}

// ---------------------------------------------------------------- 表格列
/** 全部列用 width（不用 minWidth），UnderlyingDataTable 才能按列宽和自动喂 scroll-x */
const logicColumns = [
  { title: '序', key: 'seq', width: 30 },
  {
    title: '投资逻辑',
    key: 'content',
    width: 600,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.UnderlyingLogic) => r.content
  },
  {
    title: '定价依据',
    key: 'pricing',
    width: 80,
    render: (r: Api.Irs.UnderlyingLogic) => r.pricing || '-'
  },
  {
    title: '状态',
    key: 'state',
    width: 80,
    // 行内下拉：改 state 是周级高频动作，点一下即存（后端有 state_at 留痕）
    render: (r: Api.Irs.UnderlyingLogic) =>
      h(NSelect, {
        value: stateDraft.value.get(r.seq) ?? r.state,
        options: STATE_OPTIONS,
        size: 'small',
        consistentMenuWidth: false,
        loading: stateSavingSeq.value === r.seq,
        onUpdateValue: (v: string) => changeLogicState(r, v)
      })
  },
  {
    title: '状态变更',
    key: 'state_at',
    width: 110,
    render: (r: Api.Irs.UnderlyingLogic) => (r.state_at ? r.state_at.replace('T', ' ').slice(0, 16) : '-')
  },
  {
    title: '证据',
    key: 'evidence',
    width: 110,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.UnderlyingLogic) => r.evidence || '-'
  },
  {
    title: '操作',
    key: 'action',
    width: 60,
    render: (r: Api.Irs.UnderlyingLogic) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          { text: true, size: 'tiny', type: 'primary', onClick: () => openLogicEdit(r) },
          { default: () => '编辑' }
        ),
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            type: 'error',
            loading: deletingLogicSeq.value === r.seq,
            onClick: () => handleDeleteLogic(r)
          },
          { default: () => '删除' }
        )
      ])
  }
];

/** 状态标签用（逻辑表的 state 现在是下拉，这里只保留给摘要复用） */
const logicBrokenCount = computed(() => logic.value.filter(l => l.state === '破坏').length);
const logicWeakenedCount = computed(() => logic.value.filter(l => l.state === '减弱').length);
</script>

<template>
  <div>
    <SectionBar :title="`投资逻辑（${logic.length} 条）`">
      <NTag v-if="logicWeakenedCount" size="small" :bordered="false" type="warning">减弱 {{ logicWeakenedCount }}</NTag>
      <NTag v-if="logicBrokenCount" size="small" :bordered="false">破坏 {{ logicBrokenCount }}</NTag>
      <span class="text-12px text-gray-400">状态在表格里直接改，点一下即存；基调是 2-4 条，超了不拦</span>
      <template #actions>
        <NButton size="tiny" @click="openLogicNew">新增逻辑</NButton>
      </template>
    </SectionBar>
    <UnderlyingDataTable :columns="logicColumns" :data="logic" :page-size="5" hide-when-fit />

    <!-- 投资逻辑抽屉（左侧） -->
    <NDrawer v-model:show="showLogicModal" placement="left" width="520px" :mask-closable="false">
      <NDrawerContent title="投资逻辑" closable :native-scrollbar="false">
        <NForm label-placement="left" label-width="90px" :show-feedback="false">
          <NFormItem label="序号">
            <NInputNumber v-model:value="logicForm.seq" :precision="0" :min="1" style="width: 120px" />
            <!--
              判据用**已有条数**而不是 seq：seq 会有空洞（删过第 3 条后新建得 4），
              拿 seq 判断会把 4 条误报成超限。与后端 warning 的判据保持一致。
            -->
            <span class="ml-8px text-12px" :class="logic.length >= 4 ? 'text-orange-500' : 'text-gray-400'">
              {{
                logic.length >= 4
                  ? `本标的已有 ${logic.length} 条，超过纲领建议的 2-4 条（仍可保存）`
                  : '同标的同序号 = 覆盖'
              }}
            </span>
          </NFormItem>
          <NFormItem label="逻辑">
            <NInput
              v-model:value="logicForm.content"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              :maxlength="200"
              show-count
              placeholder="逻辑 → 影响路径 → 是否已定价"
            />
          </NFormItem>
          <NFormItem label="定价依据">
            <NSelect
              v-model:value="logicForm.pricing"
              :options="PRICING_OPTIONS"
              clearable
              placeholder="是否已被市场定价"
              style="width: 160px"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="logicForm.state" :options="STATE_OPTIONS" style="width: 160px" />
            <span class="ml-8px text-12px text-gray-400">状态变化时才写「状态变更」时间</span>
          </NFormItem>
          <NFormItem label="证据">
            <NInput v-model:value="logicForm.evidence" :maxlength="200" placeholder="报告章节 / 数据代码 / 指标" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showLogicModal = false">取消</NButton>
            <NButton :loading="saving" @click="saveLogic">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
