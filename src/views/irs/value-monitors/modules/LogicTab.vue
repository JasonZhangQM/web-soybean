<script setup lang="ts">
/**
 * 逻辑与证伪 Tab（批次二：可编辑）
 *
 * 两条数据模型事实决定了这里的交互：
 * 1. **不是版本化的**：`irs_vm_logic` / `irs_vm_invalidate` 的唯一键是 (symbol, seq)，
 *    只有当前态，不像研究那样按日期留史。所以这里改的是"现在怎么认为"，不是"当时怎么认为"。
 * 2. **改 state 是周级动作**：复盘第一步就是"哪条逻辑坏了"。所以状态做成表格里的行内下拉，
 *    点一下即存，不进弹窗（进弹窗要多三次点击，高频动作不能这么贵）。
 *
 * ⚠️ 行内改状态必须回填其余字段：`PUT /logic` 是**全字段覆盖**（后端无条件
 * `row.content = payload.content`），只传 seq+state 会把 content 写成空串。
 *
 * 一条硬规则在这里可视化：**证伪信号必须可量化**。后端按
 * `[><≥≤=]\s*\d` 或 `\d+\s*%` 判定，判定不过的整行标红——"分位偏高"这类说法不算填了。
 * 前端照抄同一条正则做实时提示，但**不阻断保存**：先登记、后补数字是正常节奏。
 */
import { ref, reactive, computed, h } from 'vue';
import { NButton, NInput, NInputNumber, NSelect, NTag } from 'naive-ui';
import {
  saveVmLogic,
  deleteVmLogic,
  saveVmInvalidate,
  deleteVmInvalidate,
  type VmLogicSaveParams
} from '@/service/api';
import VmDataTable from './VmDataTable.vue';

defineOptions({ name: 'VmLogicTab' });

const props = defineProps<{
  vmId: number;
  logic: Api.Irs.VmLogic[];
  invalidate: Api.Irs.VmInvalidate[];
}>();
const emit = defineEmits<{ (e: 'refresh'): void }>();

/** 状态取值以 `models.VmLogic.STATE_CHOICES` 为准；这里曾写成「受损」，会让按 state 聚合漏数 */
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
const STATUS_OPTIONS = [
  { value: '未触发', label: '未触发' },
  { value: '已触发', label: '已触发' },
  { value: '已失效', label: '已失效' }
];

/**
 * 与后端同一正则（router 里读的时候用它算 `quantified`）。
 * 前端只用它做"填的时候就知道会不可量化"的实时提示，不参与保存判断。
 */
const QUANTIFIED_RE = /[><≥≤=]\s*\d|\d+\s*%/;

const saving = ref(false);
const deletingLogicSeq = ref<number | null>(null);
const deletingInvalidateSeq = ref<number | null>(null);
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
  const maxSeq = props.logic.reduce((m, l) => Math.max(m, l.seq), 0);
  logicForm.seq = maxSeq + 1;
  logicForm.content = '';
  logicForm.pricing = null;
  logicForm.state = '完好';
  logicForm.evidence = '';
  showLogicModal.value = true;
}

function openLogicEdit(row: Api.Irs.VmLogic) {
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
    const payload: VmLogicSaveParams = {
      seq: logicForm.seq,
      content: logicForm.content.trim(),
      pricing: logicForm.pricing,
      state: logicForm.state,
      evidence: logicForm.evidence.trim() || null
    };
    const { data, error } = await saveVmLogic(props.vmId, payload);
    if (!error) {
      if (data?.warning) window.$message?.warning(data.warning);
      else window.$message?.success(data?.action === 'created' ? '已新增一条逻辑' : '已保存');
      showLogicModal.value = false;
      emit('refresh');
    }
  } finally {
    saving.value = false;
  }
}

/** 行内改状态：立刻落库（有 state_at 留痕，改错能改回，所以不做二次确认） */
async function changeLogicState(row: Api.Irs.VmLogic, state: string) {
  if (!state || state === row.state) return;
  stateDraft.value.set(row.seq, state);
  stateSavingSeq.value = row.seq;
  try {
    // 全字段回填：后端无条件覆盖 content/pricing/evidence，漏了就清空
    const { error } = await saveVmLogic(props.vmId, {
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
    emit('refresh');
  } finally {
    stateSavingSeq.value = null;
  }
}

function handleDeleteLogic(row: Api.Irs.VmLogic) {
  const refs = props.invalidate.filter(i => i.logic_id === row.id).map(i => i.seq);
  const content = refs.length
    ? `第 ${refs.join('、')} 条证伪条件引用了这条逻辑，删除后这些证伪的「对应逻辑」会变成空引用。` +
      `如果只是这条逻辑坏了，把状态改成「破坏」比删除好。`
    : '删了就查不到当时怎么想的。如果只是这条逻辑坏了，把状态改成「破坏」比删除好。';
  window.$dialog?.warning({
    title: `删除第 ${row.seq} 条逻辑？`,
    content,
    positiveText: '仍要删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingLogicSeq.value = row.seq;
      try {
        const { error } = await deleteVmLogic(props.vmId, row.seq);
        if (!error) {
          window.$message?.success('已删除');
          emit('refresh');
        }
      } finally {
        deletingLogicSeq.value = null;
      }
    }
  });
}

// ---------------------------------------------------------------- 证伪条件
const showInvModal = ref(false);

const invForm = reactive<{
  seq: number;
  proposition: string;
  signal: string;
  logic_id: number | null;
  source: string;
  action: string;
  status: string;
  triggered_at: string | null;
}>({
  seq: 1,
  proposition: '',
  signal: '',
  logic_id: null,
  source: '',
  action: '',
  status: '未触发',
  triggered_at: null
});

/** 可量化实时提示（不阻断） */
const signalQuantified = computed(() => QUANTIFIED_RE.test(invForm.signal || ''));

/** 「对应逻辑」下拉：label 带序号和截断内容，选中后 v-model 拿的是 value（= logic.id） */
const logicOptions = computed(() =>
  props.logic.map(l => ({
    value: l.id,
    label: `第${l.seq}条 ${l.content.length > 20 ? `${l.content.slice(0, 20)}…` : l.content}`
  }))
);

function openInvNew() {
  const maxSeq = props.invalidate.reduce((m, i) => Math.max(m, i.seq), 0);
  invForm.seq = maxSeq + 1;
  invForm.proposition = '';
  invForm.signal = '';
  invForm.logic_id = null;
  invForm.source = '';
  invForm.action = '';
  invForm.status = '未触发';
  invForm.triggered_at = null;
  showInvModal.value = true;
}

function openInvEdit(row: Api.Irs.VmInvalidate) {
  invForm.seq = row.seq;
  invForm.proposition = row.proposition;
  invForm.signal = row.signal;
  invForm.logic_id = row.logic_id;
  invForm.source = row.source ?? '';
  invForm.action = row.action ?? '';
  invForm.status = row.status;
  invForm.triggered_at = row.triggered_at;
  showInvModal.value = true;
}

async function saveInv() {
  if (!invForm.proposition.trim()) {
    window.$message?.warning('命题不能为空——写清「我原来认为什么」');
    return;
  }
  if (!invForm.signal.trim()) {
    window.$message?.warning('证伪信号不能为空——没有判据的证伪等于没登记');
    return;
  }
  saving.value = true;
  try {
    const { data, error } = await saveVmInvalidate(props.vmId, {
      seq: invForm.seq,
      proposition: invForm.proposition.trim(),
      signal: invForm.signal.trim(),
      logic_id: invForm.logic_id,
      source: invForm.source.trim() || null,
      action: invForm.action.trim() || null,
      status: invForm.status,
      triggered_at: invForm.triggered_at
    });
    if (!error) {
      if (data?.warning) window.$message?.warning(data.warning);
      else window.$message?.success(data?.action === 'created' ? '已新增一条证伪' : '已保存');
      showInvModal.value = false;
      emit('refresh');
    }
  } finally {
    saving.value = false;
  }
}

function handleDeleteInv(row: Api.Irs.VmInvalidate) {
  window.$dialog?.warning({
    title: `删除第 ${row.seq} 条证伪条件？`,
    content: `证伪信号：${row.signal}。如果判据已经不再适用（比如标的逻辑变了），改状态为「已失效」比删除好——将来复盘能看到"当时以为会怎么坏"。`,
    positiveText: '仍要删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingInvalidateSeq.value = row.seq;
      try {
        const { error } = await deleteVmInvalidate(props.vmId, row.seq);
        if (!error) {
          window.$message?.success('已删除');
          emit('refresh');
        }
      } finally {
        deletingInvalidateSeq.value = null;
      }
    }
  });
}

// ---------------------------------------------------------------- 表格列
/** 全部列用 width（不用 minWidth），VmDataTable 才能按列宽和自动喂 scroll-x */
const logicColumns = [
  { title: '序', key: 'seq', width: 50 },
  {
    title: '投资逻辑',
    key: 'content',
    width: 300,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmLogic) => r.content
  },
  {
    title: '定价依据',
    key: 'pricing',
    width: 100,
    render: (r: Api.Irs.VmLogic) => r.pricing || '-'
  },
  {
    title: '状态',
    key: 'state',
    width: 110,
    // 行内下拉：改 state 是周级高频动作，点一下即存（后端有 state_at 留痕）
    render: (r: Api.Irs.VmLogic) =>
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
    width: 140,
    render: (r: Api.Irs.VmLogic) => (r.state_at ? r.state_at.replace('T', ' ').slice(0, 16) : '-')
  },
  {
    title: '证据',
    key: 'evidence',
    width: 200,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmLogic) => r.evidence || '-'
  },
  {
    title: '操作',
    key: 'action',
    width: 110,
    render: (r: Api.Irs.VmLogic) =>
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

const invalidateColumns = [
  { title: '序', key: 'seq', width: 50 },
  { title: '命题', key: 'proposition', width: 240, ellipsis: { tooltip: true } },
  {
    title: '证伪信号',
    key: 'signal',
    width: 300,
    render: (r: Api.Irs.VmInvalidate) =>
      h('div', { class: 'flex items-center gap-6px' }, [
        h('span', { class: r.quantified ? '' : 'text-red-500' }, r.signal),
        // 没有数字阈值 = 没填。用标签而不是只标红，是因为"红字"常常被当成配色
        r.quantified ? null : h(NTag, { size: 'tiny', bordered: false, type: 'error' }, { default: () => '不可量化' })
      ])
  },
  {
    title: '对应逻辑',
    key: 'logic_id',
    width: 100,
    render: (r: Api.Irs.VmInvalidate) => {
      const l = props.logic.find(x => x.id === r.logic_id);
      return l ? `第${l.seq}条` : '-';
    }
  },
  {
    title: '来源',
    key: 'source',
    width: 130,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmInvalidate) => r.source || '-'
  },
  {
    title: '动作',
    key: 'action',
    width: 130,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmInvalidate) => r.action || '-'
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r: Api.Irs.VmInvalidate) =>
      h(
        NTag,
        {
          size: 'small',
          bordered: false,
          type: r.status === '已触发' ? 'error' : r.status === '已失效' ? 'default' : 'warning'
        },
        { default: () => r.status }
      )
  },
  {
    title: '触发日',
    key: 'triggered_at',
    width: 110,
    render: (r: Api.Irs.VmInvalidate) => r.triggered_at || '-'
  },
  {
    title: '操作',
    key: 'action2',
    width: 110,
    render: (r: Api.Irs.VmInvalidate) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          { text: true, size: 'tiny', type: 'primary', onClick: () => openInvEdit(r) },
          { default: () => '编辑' }
        ),
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            type: 'error',
            loading: deletingInvalidateSeq.value === r.seq,
            onClick: () => handleDeleteInv(r)
          },
          { default: () => '删除' }
        )
      ])
  }
];

/** 状态标签用（逻辑表的 state 现在是下拉，这里只保留给摘要复用） */
const logicBrokenCount = computed(() => props.logic.filter(l => l.state === '破坏').length);
const logicWeakenedCount = computed(() => props.logic.filter(l => l.state === '减弱').length);
const invTriggeredCount = computed(() => props.invalidate.filter(i => i.status === '已触发').length);
</script>

<template>
  <div>
    <NAlert type="warning" :bordered="false" class="mb-12px">
      证伪信号必须可量化（出现「比较符 + 数字」或「数字%」）。「分位偏高」不算填了——它的阈值
      不可判定，标「不可量化」并标红。
    </NAlert>

    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">投资逻辑（{{ logic.length }} 条）</span>
      <NTag v-if="logicWeakenedCount" size="small" :bordered="false" type="warning">减弱 {{ logicWeakenedCount }}</NTag>
      <NTag v-if="logicBrokenCount" size="small" :bordered="false" type="error">破坏 {{ logicBrokenCount }}</NTag>
      <span class="text-12px text-gray-400">状态在表格里直接改，点一下即存；基调是 2-4 条，超了不拦</span>
      <NButton size="tiny" ghost class="ml-auto" @click="openLogicNew">新增逻辑</NButton>
    </div>
    <VmDataTable :columns="logicColumns" :data="logic" :page-size="10" />

    <NDivider />

    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">证伪条件（{{ invalidate.length }} 条）</span>
      <NTag v-if="invTriggeredCount" size="small" :bordered="false" type="error">已触发 {{ invTriggeredCount }}</NTag>
      <span class="text-12px text-gray-400">纲领要求 ≥3 条且覆盖研究报告第五章每条；只登记，不自动计算触发</span>
      <NButton size="tiny" ghost class="ml-auto" @click="openInvNew">新增证伪</NButton>
    </div>
    <VmDataTable :columns="invalidateColumns" :data="invalidate" :page-size="10" />
    <NEmpty v-if="!invalidate.length" size="small" description="还没有登记证伪条件" class="my-8px" />

    <!-- 逻辑弹窗 -->
    <NModal v-model:show="showLogicModal" preset="card" title="投资逻辑" class="w-640px" :mask-closable="false">
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
    </NModal>

    <!-- 证伪弹窗 -->
    <NModal v-model:show="showInvModal" preset="card" title="证伪条件" class="w-680px" :mask-closable="false">
      <NForm label-placement="left" label-width="90px" :show-feedback="false">
        <NFormItem label="序号">
          <NInputNumber v-model:value="invForm.seq" :precision="0" :min="1" style="width: 120px" />
          <span class="ml-8px text-12px text-gray-400">同标的同序号 = 覆盖</span>
        </NFormItem>
        <NFormItem label="命题">
          <NInput
            v-model:value="invForm.proposition"
            :maxlength="200"
            placeholder="我原来认为什么（会被证伪的那个判断）"
          />
        </NFormItem>
        <NFormItem label="证伪信号">
          <div class="w-full">
            <NInput
              v-model:value="invForm.signal"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              :maxlength="200"
              show-count
              placeholder="必须带数字阈值，如：贴水收敛至 <2% 且持续 5 个交易日"
            />
            <div
              v-if="invForm.signal"
              class="mt-4px text-12px"
              :class="signalQuantified ? 'text-green-500' : 'text-red-500'"
            >
              {{
                signalQuantified
                  ? '已含数字阈值，可量化'
                  : '没有数字阈值，会被判为「不可量化」——仍可保存，但复盘时算没填'
              }}
            </div>
          </div>
        </NFormItem>
        <NFormItem label="对应逻辑">
          <NSelect
            v-model:value="invForm.logic_id"
            :options="logicOptions"
            clearable
            placeholder="可选：这条证伪针对哪条逻辑"
            style="width: 100%"
          />
        </NFormItem>
        <NFormItem label="来源">
          <NInput v-model:value="invForm.source" :maxlength="64" placeholder="数据源 / 报告章节" />
        </NFormItem>
        <NFormItem label="动作">
          <NInput v-model:value="invForm.action" :maxlength="32" placeholder="触发后做什么：减仓 / 清仓 / 重估" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="invForm.status" :options="STATUS_OPTIONS" style="width: 160px" />
        </NFormItem>
        <NFormItem label="触发日">
          <NDatePicker
            v-model:formatted-value="invForm.triggered_at"
            type="date"
            value-format="yyyy-MM-dd"
            clearable
            style="width: 160px"
          />
          <span class="ml-8px text-12px text-gray-400">状态选「已触发」时才需要填</span>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showInvModal = false">取消</NButton>
          <NButton :loading="saving" @click="saveInv">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
