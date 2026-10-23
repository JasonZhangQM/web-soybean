<script setup lang="ts">
/**
 * 研究 Tab：研究版本列表 + 按日期新建/编辑
 *
 * 语义同档位：**选新日期 = 新建一版，选已有日期 = 改那一版**。
 * 系统只存「决策与执行状态」（摘要 ≤800 字、单条逻辑/风险 ≤200 字、研究过程 ≤2000 字），
 * 报告正文留在知识库——所以这里的字段全是短的，长文请写进 research_note 指向知识库。
 */
import { ref, reactive, computed, watch, h } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { saveVmResearch, deleteVmResearch } from '@/service/api';
import VmDataTable from './VmDataTable.vue';

defineOptions({ name: 'VmResearchVersionPanel' });

const props = defineProps<{ vmId: number; research: Api.Irs.VmResearch[] }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();

const saving = ref(false);
const deleting = ref(false);

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 后端校验的长度上限（超了会 400，前端先拦，避免白跑一趟） */
const LIMITS = {
  thesis: 200,
  conclusion: 200,
  max_risk: 200,
  pre_condition: 200,
  research_brief: 800,
  research_log: 2000
} as const;

const form = reactive<{
  research_date: string | null;
  thesis: string;
  conclusion: string;
  max_risk: string;
  expectation_gap: string;
  pre_condition: string;
  next_review: string | null;
  research_note: string;
  research_brief: string;
  research_log: string;
}>({
  research_date: today(),
  thesis: '',
  conclusion: '',
  max_risk: '',
  expectation_gap: '',
  pre_condition: '',
  next_review: null,
  research_note: '',
  research_brief: '',
  research_log: ''
});

/** 当前日期命中的已有版本 */
const hit = computed(() => props.research.find(r => r.research_date === form.research_date) ?? null);

const dateHint = computed(() => {
  if (!form.research_date) return '请选择研究定稿日';
  if (hit.value) return `该日已有一版研究——保存将改写 ${form.research_date} 的结论`;
  if (form.research_date > today())
    return `未来日 ${form.research_date}：列表页结论只取 ≤今天 的最新一版，所以现在不生效`;
  return `新日期 ${form.research_date}：保存将新建一版研究`;
});

/** 用某一版回填表单 */
function loadVersion(r: Api.Irs.VmResearch) {
  form.research_date = r.research_date;
  form.thesis = r.thesis ?? '';
  form.conclusion = r.conclusion ?? '';
  form.max_risk = r.max_risk ?? '';
  form.expectation_gap = r.expectation_gap ?? '';
  form.pre_condition = r.pre_condition ?? '';
  form.next_review = r.next_review;
  form.research_note = r.research_note ?? '';
  form.research_brief = r.research_brief ?? '';
  form.research_log = r.research_log ?? '';
}

// 打开时若有最新一版，直接载入，省一次点击
watch(
  () => props.research,
  list => {
    if (list.length && !form.thesis && !form.conclusion) loadVersion(list[0]);
  },
  { immediate: true }
);

/** 新建：清空但保留日期选择权 */
function startNew() {
  form.thesis = '';
  form.conclusion = '';
  form.max_risk = '';
  form.expectation_gap = '';
  form.pre_condition = '';
  form.next_review = null;
  form.research_note = '';
  form.research_brief = '';
  form.research_log = '';
  form.research_date = today();
}

function overLimit() {
  const bad: string[] = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = (form as Record<string, unknown>)[k] as string;
    if (v && v.length > max) bad.push(`${k} 超 ${max} 字（当前 ${v.length}）`);
  }
  return bad;
}

function doSave(force = false) {
  if (!form.research_date) {
    window.$message?.warning('请选择研究定稿日');
    return;
  }
  const bad = overLimit();
  if (bad.length) {
    window.$message?.warning(`字段超长：${bad.join('；')}`);
    return;
  }
  const run = async () => {
    saving.value = true;
    try {
      const { data, error } = await saveVmResearch(props.vmId, {
        research_date: form.research_date as string,
        thesis: form.thesis || null,
        conclusion: form.conclusion || null,
        max_risk: form.max_risk || null,
        expectation_gap: form.expectation_gap || null,
        pre_condition: form.pre_condition || null,
        next_review: form.next_review || null,
        research_note: form.research_note || null,
        research_brief: form.research_brief || null,
        research_log: form.research_log || null
      });
      if (!error) {
        window.$message?.success(data?.action === 'created' ? '已新建一版研究' : '已改写该日研究');
        emit('refresh');
      }
    } finally {
      saving.value = false;
    }
  };

  if (force || !hit.value) {
    run();
    return;
  }
  window.$dialog?.warning({
    title: `将改写 ${form.research_date} 的研究结论`,
    content: `原来：${hit.value.conclusion || '（未填）'} → 现在：${form.conclusion || '（未填）'}。不做软删除，改写后无法恢复原文，确认？`,
    positiveText: '确认改写',
    negativeText: '取消',
    onPositiveClick: run
  });
}

function handleDelete() {
  if (!form.research_date || !hit.value) return;
  window.$dialog?.warning({
    title: `删除 ${form.research_date} 这一版研究？`,
    content: '删的是这一天的研究结论，其他日期版本不受影响。',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deleting.value = true;
      try {
        const { error } = await deleteVmResearch(props.vmId, form.research_date as string);
        if (!error) {
          window.$message?.success('已删除该版研究');
          startNew();
          emit('refresh');
        }
      } finally {
        deleting.value = false;
      }
    }
  });
}

const columns = [
  { title: '定稿日', key: 'research_date', width: 110 },
  {
    title: '结论',
    key: 'conclusion',
    width: 200,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmResearch) => r.conclusion || '未填'
  },
  {
    title: '下次复核',
    key: 'next_review',
    width: 110,
    render: (r: Api.Irs.VmResearch) =>
      h('span', { class: r.next_review && r.next_review < today() ? 'text-red-500' : '' }, r.next_review || '未填')
  },
  {
    title: '标记',
    key: 'flag',
    width: 100,
    render: (r: Api.Irs.VmResearch) =>
      r.research_date > today()
        ? h(NTag, { size: 'small', bordered: false, type: 'warning' }, { default: () => '未来日' })
        : null
  },
  {
    title: '操作',
    key: 'action',
    width: 90,
    render: (r: Api.Irs.VmResearch) =>
      h(
        NButton,
        { text: true, size: 'tiny', type: 'primary', onClick: () => loadVersion(r) },
        {
          default: () => '编辑'
        }
      )
  }
];

// 字数提示：接近上限时变黄，超了变红
function countClass(k: keyof typeof LIMITS, v: string) {
  const max = LIMITS[k];
  if (v.length > max) return 'text-red-500';
  if (v.length > max * 0.9) return 'text-orange-500';
  return 'text-gray-400';
}
</script>

<template>
  <div>
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">研究版本</span>
      <span class="text-12px text-gray-400">
        选新日期 = 新建一版，选已有日期 = 改那一版；列表页的「结论」取 ≤今天 的最新一版
      </span>
      <NButton size="tiny" type="primary" ghost class="ml-auto" @click="startNew">新建一版</NButton>
    </div>
    <VmDataTable :columns="columns" :data="research" :page-size="10" />
    <NEmpty v-if="!research.length" size="small" description="还没有研究版本" class="my-8px" />

    <NDivider />

    <NForm label-placement="left" label-width="90px" :show-feedback="false">
      <NFormItem label="定稿日">
        <NDatePicker
          v-model:formatted-value="form.research_date"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          style="width: 160px"
        />
        <span class="ml-8px text-12px" :class="hit && form.research_date ? 'text-orange-500' : 'text-gray-400'">
          {{ dateHint }}
        </span>
      </NFormItem>
      <NFormItem label="结论">
        <NInput
          v-model:value="form.conclusion"
          placeholder="如：维持观望 / 下调至回避 / 加仓"
          :maxlength="LIMITS.conclusion"
        />
        <span class="ml-8px text-12px" :class="countClass('conclusion', form.conclusion)">
          {{ form.conclusion.length }}/{{ LIMITS.conclusion }}
        </span>
      </NFormItem>
      <NFormItem label="核心论点">
        <NInput
          v-model:value="form.thesis"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITS.thesis"
          placeholder="一句话说清赚什么钱（贴水/股息/成长/均值回归），不写故事"
        />
      </NFormItem>
      <NFormItem label="最大风险">
        <NInput
          v-model:value="form.max_risk"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :maxlength="LIMITS.max_risk"
          placeholder="最可能让我亏钱的那件事，要具体"
        />
      </NFormItem>
      <NFormItem label="预期差">
        <NInput v-model:value="form.expectation_gap" placeholder="我与市场看法不同在哪" />
      </NFormItem>
      <NFormItem label="前提条件">
        <NInput
          v-model:value="form.pre_condition"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :maxlength="LIMITS.pre_condition"
          placeholder="逻辑成立必须先满足什么（如贴水不收敛、政策不变）"
        />
      </NFormItem>
      <NFormItem label="下次复核">
        <NDatePicker
          v-model:formatted-value="form.next_review"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          style="width: 160px"
        />
        <span class="ml-8px text-12px text-gray-400">到期后本页「复核」列标红</span>
      </NFormItem>
      <NFormItem label="研究笔记">
        <NInput v-model:value="form.research_note" placeholder="知识库文件名或编号（报告正文不进系统）" />
      </NFormItem>
      <NFormItem label="摘要">
        <NInput
          v-model:value="form.research_brief"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :maxlength="LIMITS.research_brief"
          show-count
          placeholder="给三个月后的自己看：当时为什么这么判断"
        />
      </NFormItem>
      <NFormItem label="研究过程">
        <NInput
          v-model:value="form.research_log"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :maxlength="LIMITS.research_log"
          show-count
          placeholder="看过哪些数据、排除了哪些可能、怎么定的档位"
        />
      </NFormItem>
    </NForm>

    <NSpace>
      <NButton type="primary" :loading="saving" @click="doSave()">保存</NButton>
      <NButton v-if="hit" type="error" ghost :loading="deleting" @click="handleDelete">删除该版</NButton>
    </NSpace>
  </div>
</template>
