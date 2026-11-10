<script setup lang="ts">
/**
 * 研究与逻辑 Tab（2026-11-09 两个 Tab 合并 + 研究录入改左侧抽屉）
 *
 * 语义同档位：**选新日期 = 新建一版，选已有日期 = 改那一版**。
 * 系统只存「决策与执行状态」（摘要 ≤800 字、单条逻辑/风险 ≤200 字、研究过程 ≤2000 字），
 * 报告正文留在知识库——所以这里的字段全是短的，长文请写进 research_note 指向知识库。
 *
 * 录入统一走左侧抽屉（与 VersionTab / LogicTab / PlanTab / ReviewTab 同规格 520px）：
 * 顶部「新增一版研究」+ 行内「编辑」/「沿用新建」共用；编辑锁**定稿日**，避免按日期 upsert 时
 * 静默复制成新一版。保存成功才关抽屉，失败保留已填内容。
 *
 * 「逻辑与证伪」不再单独占一个 Tab，作为子组件插在研究版本表之后、状态演化之前；
 * 软校验的条数改由子组件实时上报，不再吃概览透传的轻量计数（合并的实收益）。
 * 内容顺序：研究版本表 → 逻辑/证伪 → 状态演化 → 剧本盈亏归因。
 */
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton, NTag } from 'naive-ui';
import {
  fetchUnderlyingResearch,
  saveUnderlyingResearch,
  deleteUnderlyingResearch,
  fetchUnderlyingStateLog,
  fetchAttributionByPlan,
  fetchUnderlyingPlans
} from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import LogicTab from './LogicTab.vue';
import SectionBar from './SectionBar.vue';

defineOptions({ name: 'UnderlyingResearchVersionPanel' });

const props = defineProps<{ umId: number; symbol: string }>();
const emit = defineEmits<{ (e: 'dirty'): void }>();

const saving = ref(false);
const deleting = ref(false);

/** 左侧录入抽屉：editingDate=null 表示新增，非 null 表示改写该日版本（定稿日锁定） */
const showDrawer = ref(false);
const editingDate = ref<string | null>(null);
/** 逻辑/证伪条数由子组件实时上报；写完一条立刻反映到保存软校验 */
const logicCounts = reactive({ logic: 0, invalidate: 0 });

function onCounts(v: { logic: number; invalidate: number }) {
  logicCounts.logic = v.logic;
  logicCounts.invalidate = v.invalidate;
}

/** 逻辑/证伪状态变更会追加 state_log，合并后同屏可见 ⇒ 顺手重拉时间线 */
function onChildDirty() {
  loadStateLog();
  emit('dirty');
}

// 自管数据（懒加载，切到本 Tab 时 onMounted 拉）
const research = ref<Api.Irs.UnderlyingResearch[]>([]);
async function loadResearch() {
  const { data, error } = await fetchUnderlyingResearch(props.umId);
  if (!error && data) research.value = data;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 后端校验的长度上限（超了会 400，前端先拦，避免白跑一趟） */
const LIMITS = {
  thesis: 200,
  conclusion: 200,
  max_risk: 200,
  expectation_gap: 200,
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
const hit = computed(() => research.value.find(r => r.research_date === form.research_date) ?? null);

const dateHint = computed(() => {
  if (editingDate.value) return `编辑 ${editingDate.value} 这一版（定稿日锁定）——保存将改写该日结论`;
  if (!form.research_date) return '请选择研究定稿日';
  if (hit.value) return `该日已有一版研究——保存将改写 ${form.research_date} 的结论`;
  if (form.research_date > today())
    return `未来日 ${form.research_date}：列表页结论只取 ≤今天 的最新一版，所以现在不生效`;
  return `新日期 ${form.research_date}：保存将新建一版研究`;
});

/** 用某一版回填表单 */
function loadVersion(r: Api.Irs.UnderlyingResearch) {
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

function clearForm() {
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

/** 新增：清空后日期设今天；传 template 时以该版为底稿另起一版（沿用新建） */
function openNew(template?: Api.Irs.UnderlyingResearch) {
  editingDate.value = null;
  if (template) loadVersion(template);
  else clearForm();
  form.research_date = today();
  showDrawer.value = true;
}

/** 编辑：回填该版全部字段，定稿日锁定（后端按 (symbol, research_date) upsert） */
function openEdit(r: Api.Irs.UnderlyingResearch) {
  editingDate.value = r.research_date;
  loadVersion(r);
  showDrawer.value = true;
}

function overLimit() {
  const bad: string[] = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = (form as Record<string, unknown>)[k] as string;
    if (v && v.length > max) bad.push(`${k} 超 ${max} 字（当前 ${v.length}）`);
  }
  return bad;
}

function doSave(force = false, skipSoft = false) {
  if (!form.research_date) {
    window.$message?.warning('请选择研究定稿日');
    return;
  }
  const bad = overLimit();
  if (bad.length) {
    window.$message?.warning(`字段超长：${bad.join('；')}`);
    return;
  }
  // 软校验：纲领要求证伪 ≥3 条且覆盖第五章每条。**只提示不阻断**——
  // 合并后证伪就在同一 Tab 下方，点「先补证伪」可就地补；硬拦会让人为凑数写废话判据。
  const soft =
    logicCounts.invalidate < 3
      ? `本标的目前只有 ${logicCounts.invalidate} 条证伪条件（纲领要求 ≥3 条，且覆盖研究报告第五章每条）`
      : null;
  if (soft && !skipSoft) {
    window.$dialog?.warning({
      title: '证伪条数不足',
      content: `${soft}。研究可以照存，但这份结论暂时没有可证伪的判据——将来无法判断逻辑坏没坏。`,
      positiveText: '仍然保存',
      negativeText: '先补证伪',
      onPositiveClick: () => doSave(force, true)
    });
    return;
  }
  const run = async () => {
    saving.value = true;
    try {
      const { data, error } = await saveUnderlyingResearch(props.umId, {
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
        await loadResearch();
        emit('dirty');
        // 失败时保持抽屉打开，不丢已填内容
        showDrawer.value = false;
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
        const { error } = await deleteUnderlyingResearch(props.umId, form.research_date as string);
        if (!error) {
          window.$message?.success('已删除该版研究');
          showDrawer.value = false;
          await loadResearch();
          emit('dirty');
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
    render: (r: Api.Irs.UnderlyingResearch) => r.conclusion || '未填'
  },
  {
    title: '下次复核',
    key: 'next_review',
    width: 110,
    render: (r: Api.Irs.UnderlyingResearch) =>
      h('span', { class: r.next_review && r.next_review < today() ? 'text-red-500' : '' }, r.next_review || '未填')
  },
  {
    title: '标记',
    key: 'flag',
    width: 100,
    render: (r: Api.Irs.UnderlyingResearch) =>
      r.research_date > today()
        ? h(NTag, { size: 'small', bordered: false, type: 'warning' }, { default: () => '未来日' })
        : null
  },
  {
    title: '操作',
    key: 'action',
    width: 180,
    render: (r: Api.Irs.UnderlyingResearch) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            title: '以该版内容为底稿另起一版，定稿日设为今天；若今天已有版本则为改写',
            onClick: () => openNew(r)
          },
          { default: () => '沿用新建' }
        ),
        h(NButton, { text: true, size: 'tiny', type: 'primary', onClick: () => openEdit(r) }, { default: () => '编辑' })
      ])
  }
];

// ---------------- 复盘视图：状态演化 + 剧本盈亏归因 ----------------
const stateLog = ref<Api.Irs.UnderlyingStateLog[]>([]);
const attribution = ref<Api.Bills.AttributionByPlan | null>(null);
const allPlans = ref<Api.Irs.UnderlyingPlan[]>([]);
const attributionLoading = ref(false);

function subjectLabel(t: string) {
  return t === 'logic' ? '逻辑' : '证伪';
}

/** 状态演化：本标的逻辑/证伪的 append-only 日志，正序回放「首次 → 当前」 */
async function loadStateLog() {
  const { data } = await fetchUnderlyingStateLog(props.umId);
  if (data) stateLog.value = data;
}

/** 剧本盈亏归因：只统计本标的（传 underlying_symbol），plan_id → 剧本名靠 /irs/plans 映射 */
async function loadAttribution() {
  attributionLoading.value = true;
  try {
    const [attr, plans] = await Promise.all([fetchAttributionByPlan(props.symbol), fetchUnderlyingPlans(props.umId)]);
    if (!attr.error && attr.data) attribution.value = attr.data;
    if (!plans.error && plans.data) allPlans.value = plans.data;
  } finally {
    attributionLoading.value = false;
  }
}

const planMap = computed(() => {
  const m = new Map<number, Api.Irs.UnderlyingPlan>();
  for (const p of allPlans.value) m.set(p.id, p);
  return m;
});

type AttributionRow = Api.Bills.AttributionPlan & { plan_label: string };

/** 归因行：把裸 plan_id 补成「标的 合约」可读名 */
const attributionRows = computed<AttributionRow[]>(() => {
  if (!attribution.value) return [];
  return attribution.value.items.map(it => {
    const p = planMap.value.get(it.plan_id);
    return { plan_label: p ? `${p.underlying_symbol} ${p.trade_symbol}` : `#${it.plan_id}`, ...it };
  });
});

/** 正负号格式化盈亏；null 显示 — */
function fmtPl(v: number | null | undefined) {
  if (v == null) return '-';
  const n = Number(v);
  return (n > 0 ? '+' : '') + n.toFixed(2);
}

const attributionColumns = [
  {
    title: '剧本（标的 合约）',
    key: 'plan_label',
    width: 220,
    ellipsis: { tooltip: true }
  },
  { title: '执行次数', key: 'exec_count', width: 90, align: 'right' as const },
  {
    title: '累计平仓盈亏',
    key: 'total_pl',
    width: 120,
    align: 'right' as const,
    render: (r: AttributionRow) => fmtPl(r.total_pl)
  },
  {
    title: '胜率',
    key: 'win_rate',
    width: 80,
    align: 'right' as const,
    render: (r: AttributionRow) => `${(Number(r.win_rate) * 100).toFixed(0)}%`
  },
  {
    title: '平均盈亏',
    key: 'avg_pl',
    width: 100,
    align: 'right' as const,
    render: (r: AttributionRow) => fmtPl(r.avg_pl)
  },
  {
    title: '最近成交',
    key: 'last_trade_time',
    width: 130,
    render: (r: AttributionRow) => (r.last_trade_time ? r.last_trade_time.slice(0, 10) : '-')
  }
];

onMounted(() => {
  loadResearch();
  loadStateLog();
  loadAttribution();
});

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
    <SectionBar title="研究版本">
      <span class="text-12px text-gray-400">
        选新日期 = 新建一版，选已有日期 = 改那一版；列表页的「结论」取 ≤今天 的最新一版
      </span>
      <template #actions>
        <NButton size="tiny" @click="openNew()">新增一版研究</NButton>
      </template>
    </SectionBar>
    <UnderlyingDataTable :columns="columns" :data="research" :page-size="5" hide-when-fit />

    <!-- 逻辑与证伪（原独立 Tab，2026-11-09 并入；内部两张表 + 两个左侧抽屉自治） -->
    <LogicTab :um-id="umId" :symbol="symbol" @dirty="onChildDirty" @counts="onCounts" />

    <!-- 复盘视图：状态演化（P2-3）+ 剧本盈亏归因（P3-3） -->
    <SectionBar title="状态演化">
      <span class="text-12px text-gray-400">逻辑 state / 证伪 status 的追加日志，改一次记一条，不复写旧值</span>
    </SectionBar>
    <NEmpty v-if="!stateLog.length" size="small" description="还没有状态变更记录" class="my-8px" />
    <NTimeline v-else class="mt-8px">
      <NTimelineItem
        v-for="l in stateLog"
        :key="l.id"
        :type="
          l.to_state === '破坏' || l.to_state === '已触发' ? 'error' : l.to_state === '减弱' ? 'warning' : 'success'
        "
        :title="`${subjectLabel(l.subject_type)}：${l.from_state ?? '（首次登记）'} → ${l.to_state}`"
        :time="l.changed_at"
      >
        {{ l.note || '' }}
      </NTimelineItem>
    </NTimeline>

    <SectionBar title="剧本盈亏归因">
      <span class="text-12px text-gray-400">只统计本标的的剧本（underlying_symbol 过滤）；未归因成交显式标注</span>
    </SectionBar>
    <NSpin :show="attributionLoading">
      <UnderlyingDataTable
        v-if="attributionRows.length"
        :columns="attributionColumns"
        :data="attributionRows"
        :page-size="0"
      />
      <NEmpty v-else-if="!attributionLoading" size="small" description="还没有带剧本标记的成交" class="my-8px" />
    </NSpin>
    <NAlert v-if="attribution" type="info" :bordered="false" class="mt-8px">
      未归因成交
      <b>{{ attribution.unattributed.exec_count }}</b>
      笔，累计平仓盈亏
      <b>{{ fmtPl(attribution.unattributed.total_pl) }}</b>
    </NAlert>

    <!-- 研究录入抽屉（左侧），与逻辑 / 证伪 / 档位 / 剧本 / 复盘抽屉同规格 -->
    <NDrawer v-model:show="showDrawer" placement="left" width="520px" :mask-closable="false">
      <NDrawerContent
        :title="editingDate ? `编辑 ${editingDate} 这一版研究` : '新增一版研究'"
        closable
        :native-scrollbar="false"
      >
        <NForm label-placement="left" label-width="90px" :show-feedback="false">
          <NFormItem label="定稿日">
            <NDatePicker
              v-model:formatted-value="form.research_date"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              :disabled="editingDate !== null"
              style="width: 160px"
            />
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
            <NInput
              v-model:value="form.expectation_gap"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              :maxlength="LIMITS.expectation_gap"
              placeholder="我与市场看法不同在哪"
            />
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
        <div class="mt-8px text-12px" :class="hit && form.research_date ? 'text-orange-500' : 'text-gray-400'">
          {{ dateHint }}
        </div>

        <template #footer>
          <NSpace justify="end">
            <NButton @click="showDrawer = false">取消</NButton>
            <NButton v-if="hit" :loading="deleting" @click="handleDelete">删除该版</NButton>
            <NButton :loading="saving" @click="doSave()">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
