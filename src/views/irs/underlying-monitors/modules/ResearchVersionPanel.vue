<script setup lang="ts">
/**
 * 研究与复盘 Tab（2026-11-09 逻辑并入 + 研究录入改左侧抽屉；2026-11-27 复盘 Tab 并入）
 *
 * 语义同档位：**选新日期 = 新建一版，选已有日期 = 改那一版**。
 * 系统只存「决策所需的最小结构化信息」，一个职责只归一个字段：
 * 核心论点 ≤80（买什么）、最大风险 ≤120（含时点+阈值）、前提条件 ≤200（只写标的层阈值）、
 * 摘要 ≤500（当时怎么想，不写价格快照——价格由 data_asof 回放）。
 * 报告正文留在知识库，report_ref 存文件名作双向链；预期差不单列字段（论证归报告 §5）。
 *
 * 录入统一走左侧抽屉（与 VersionTab / LogicTab / PlanTab / ReviewTab 同规格 520px）：
 * 顶部「新增一版研究」+ 行内「编辑」/「沿用新建」共用；编辑锁**定稿日**，避免按日期 upsert 时
 * 静默复制成新一版。保存成功才关抽屉，失败保留已填内容。
 *
 * 「逻辑」「复盘」不再单独占 Tab，作为子组件依次插在研究版本表之后；
 * 内容顺序：研究版本表 → 逻辑 → 复盘 → 状态演化 → 剧本盈亏归因。
 * 证伪条件已于 2026-11-27 移出系统（只在研报文件中维护），保存时不再做证伪条数软校验。
 */
import { ref, reactive, computed, h, onMounted } from 'vue';
import { NButton, NTag } from 'naive-ui';
import {
  fetchUnderlyingLogic,
  fetchUnderlyingResearch,
  saveUnderlyingResearch,
  deleteUnderlyingResearch,
  fetchUnderlyingStateLog,
  fetchAttributionByPlan,
  fetchUnderlyingPlans
} from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import LogicTab from './LogicTab.vue';
import ReviewTab from './ReviewTab.vue';
import SectionBar from './SectionBar.vue';

defineOptions({ name: 'UnderlyingResearchVersionPanel' });

const props = defineProps<{ umId: number; symbol: string }>();
const emit = defineEmits<{ (e: 'dirty'): void }>();

const saving = ref(false);
const deleting = ref(false);

/** 左侧录入抽屉：editingDate=null 表示新增，非 null 表示改写该日版本（定稿日锁定） */
const showDrawer = ref(false);
const editingDate = ref<string | null>(null);

/** 逻辑状态变更会追加 state_log，合并后同屏可见 ⇒ 顺手重拉时间线 */
function onChildDirty() {
  loadStateLog();
  loadLogicRows();
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

/** 后端校验的长度上限（与 DB 列宽逐位一致，超了会 400，前端先拦） */
const LIMITS = {
  thesis: 80,
  max_risk: 120,
  pre_condition: 200,
  research_brief: 500,
  report_ref: 128
} as const;

const form = reactive<{
  research_date: string | null;
  data_asof: string | null;
  thesis: string;
  /** 结论改为下拉选项（clearable），清空时为 null */
  conclusion: string | null;
  max_risk: string;
  pre_condition: string;
  next_review: string | null;
  report_ref: string;
  research_brief: string;
}>({
  research_date: today(),
  data_asof: null,
  thesis: '',
  conclusion: '',
  max_risk: '',
  pre_condition: '',
  next_review: null,
  report_ref: '',
  research_brief: ''
});

/** 结论下拉选项：与后端 UnderlyingResearch.CONCLUSION_CHOICES 保持一致 */
const CONCLUSION_OPTIONS = ['买入', '增持', '持有', '观望', '减持', '卖出'].map(v => ({ label: v, value: v }));

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
  form.data_asof = r.data_asof ?? null;
  form.thesis = r.thesis ?? '';
  form.conclusion = r.conclusion ?? '';
  form.max_risk = r.max_risk ?? '';
  form.pre_condition = r.pre_condition ?? '';
  form.next_review = r.next_review;
  form.report_ref = r.report_ref ?? '';
  form.research_brief = r.research_brief ?? '';
}

function clearForm() {
  form.data_asof = null;
  form.thesis = '';
  form.conclusion = '';
  form.max_risk = '';
  form.pre_condition = '';
  form.next_review = null;
  form.report_ref = '';
  form.research_brief = '';
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
      const { data, error } = await saveUnderlyingResearch(props.umId, {
        research_date: form.research_date as string,
        data_asof: form.data_asof || null,
        thesis: form.thesis || null,
        conclusion: form.conclusion || null,
        max_risk: form.max_risk || null,
        pre_condition: form.pre_condition || null,
        next_review: form.next_review || null,
        report_ref: form.report_ref || null,
        research_brief: form.research_brief || null
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

/** 逻辑清单：状态演化按逻辑分组需要 seq / content 标注（LogicTab 内部数据，这里轻量重拉一份） */
const logicRows = ref<Api.Irs.UnderlyingLogic[]>([]);
async function loadLogicRows() {
  const { data } = await fetchUnderlyingLogic(props.umId);
  if (data) logicRows.value = data;
}

/**
 * 状态演化：按逻辑分组，每条逻辑两行成对——
 *   状态行  逻辑1：完好(2026-09-01) → 减弱(2026-10-15) → 破坏(2026-11-20)
 *   定价行  逻辑1 · 定价：未定价(2026-09-01) → 充分定价(2026-11-20)
 * 首节点 = 逻辑标注 + 首次登记的状态合成一步；日期只展示日期部分。
 * 证伪已删除（2026-11-27），残留 invalidate 行过滤；subject_id 找不到对应逻辑
 * （逻辑被删）时回退用 逻辑#id 标注，演化记录不丢。
 */
function buildChains(logs: Api.Irs.UnderlyingStateLog[]) {
  if (!logs.length) return new Map<number, { head: ChainNode; steps: ChainStep[] }>();
  const seqOf = new Map(logicRows.value.map(r => [r.id, r]));
  const byId = new Map<number, Api.Irs.UnderlyingStateLog[]>();
  for (const l of logs) {
    const arr = byId.get(l.subject_id) ?? [];
    arr.push(l);
    byId.set(l.subject_id, arr);
  }
  const out = new Map<number, { head: ChainNode; steps: ChainStep[] }>();
  for (const [id, arr] of byId) {
    const row = seqOf.get(id);
    // 首节点 = 逻辑标注与首次登记的状态合成一步，格式「逻辑1：完好(2026-11-27)」
    const head: ChainNode = {
      label: row ? `逻辑${row.seq}` : `逻辑#${id}（已删除）`,
      tip: row?.content ?? '',
      state: arr[0].to_state,
      date: arr[0].create_time.slice(0, 10)
    };
    const steps = arr.slice(1).map(l => ({
      label: l.to_state,
      tip: l.note ?? '',
      date: l.create_time.slice(0, 10)
    }));
    out.set(id, { head, steps });
  }
  return out;
}

interface ChainNode {
  label: string;
  tip: string;
  state: string;
  date: string;
}

/** 后续变更节点：直接用 label 渲染，无首登记语义 */
interface ChainStep {
  label: string;
  tip: string;
  date: string;
}

const stateChainMap = computed(() => buildChains(stateLog.value.filter(l => l.subject_type === 'logic')));
const pricingChainMap = computed(() => buildChains(stateLog.value.filter(l => l.subject_type === 'logic_pricing')));

/** 演化行：状态链与定价链按逻辑 id 成对；两类日志都没有的逻辑不出现 */
const evolutionRows = computed(() => {
  const ids = new Set([...stateChainMap.value.keys(), ...pricingChainMap.value.keys()]);
  return [...ids]
    .sort((a, b) => {
      const sa = logicRows.value.find(r => r.id === a)?.seq ?? 9999;
      const sb = logicRows.value.find(r => r.id === b)?.seq ?? 9999;
      if (sa !== sb) return sa - sb;
      return a - b;
    })
    .map(id => ({ id, state: stateChainMap.value.get(id) ?? null, pricing: pricingChainMap.value.get(id) ?? null }));
});

/** 节点配色：破坏/充分定价=红、减弱/部分定价=琥珀、完好/未定价/其他=绿 */
function stateCls(s: string) {
  if (s === '破坏' || s === '充分定价') return 'text-red-500';
  if (s === '减弱' || s === '部分定价') return 'text-amber-500';
  return 'text-green-600';
}

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
  loadLogicRows();
  loadAttribution();
});
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

    <!-- 投资逻辑（2026-11-09 并入；证伪已于 2026-11-27 移出系统，只在研报文件中维护） -->
    <LogicTab :um-id="umId" :symbol="symbol" @dirty="onChildDirty" />

    <!-- 复盘（原独立 Tab，2026-11-27 并入，紧跟逻辑之后） -->
    <ReviewTab :um-id="umId" :symbol="symbol" @dirty="onChildDirty" />

    <!-- 复盘视图：状态演化（逻辑状态 + 定价情况两行成对）+ 剧本盈亏归因（P3-3） -->
    <SectionBar title="状态演化">
      <span class="text-12px text-gray-400">
        每条逻辑两行：逻辑状态 + 定价情况；首节点即首次登记，日期括号缀在状态后
      </span>
    </SectionBar>
    <NEmpty v-if="!evolutionRows.length" size="small" description="还没有状态变更记录" class="my-8px" />
    <div v-else class="mt-8px flex flex-col gap-6px">
      <!-- 每条逻辑一行：左半状态链、右半定价链 -->
      <div v-for="r in evolutionRows" :key="r.id" class="flex items-start gap-x-8px">
        <!-- 左：状态链 -->
        <div v-if="r.state" class="flex min-w-0 flex-1 flex-wrap items-start gap-x-4px gap-y-2px">
          <span class="text-13px" :title="r.state.head.tip">
            <span class="text-gray-500">{{ r.state.head.label }} · 状态：</span>
            <span class="font-500" :class="stateCls(r.state.head.state)">{{ r.state.head.state }}</span>
            <span class="text-gray-400">({{ r.state.head.date }})</span>
          </span>
          <template v-for="(s, i) in r.state.steps" :key="`s-${r.id}-${i}`">
            <span class="text-13px leading-20px text-gray-400">→</span>
            <span class="text-13px font-500" :class="stateCls(s.label)" :title="s.tip">
              {{ s.label }}
              <span class="text-gray-400 font-400">({{ s.date }})</span>
            </span>
          </template>
        </div>
        <!-- 右：定价链（有定价变更日志才显示） -->
        <div v-if="r.pricing" class="flex min-w-0 flex-1 flex-wrap items-start gap-x-4px gap-y-2px">
          <span class="text-13px" :title="r.pricing.head.tip">
            <span class="text-gray-500">{{ r.pricing.head.label }} · 定价：</span>
            <span class="font-500" :class="stateCls(r.pricing.head.state)">{{ r.pricing.head.state }}</span>
            <span class="text-gray-400">({{ r.pricing.head.date }})</span>
          </span>
          <template v-for="(s, i) in r.pricing.steps" :key="`p-${r.id}-${i}`">
            <span class="text-13px leading-20px text-gray-400">→</span>
            <span class="text-13px font-500" :class="stateCls(s.label)" :title="s.tip">
              {{ s.label }}
              <span class="text-gray-400 font-400">({{ s.date }})</span>
            </span>
          </template>
        </div>
      </div>
    </div>

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

    <!-- 研究录入抽屉（左侧），与逻辑 / 档位 / 剧本 / 复盘抽屉同规格 -->
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
          <NFormItem label="数据截止">
            <NDatePicker
              v-model:formatted-value="form.data_asof"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              style="width: 160px"
            />
            <span class="ml-8px text-12px text-gray-400">摘要不必写价格，靠这个日期回放当时行情</span>
          </NFormItem>
          <NFormItem label="结论">
            <NSelect
              v-model:value="form.conclusion"
              :options="CONCLUSION_OPTIONS"
              placeholder="选择结论评级"
              clearable
              style="width: 160px"
            />
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
              show-count
              placeholder="最可能让我亏钱的那件事，须写清时点与阈值"
            />
          </NFormItem>
          <NFormItem label="前提条件">
            <NInput
              v-model:value="form.pre_condition"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              :maxlength="LIMITS.pre_condition"
              placeholder="只写标的层阈值（价格/毛利/现金流）；风险度、保证金、安全垫归 /risk 实时口径，不写这里"
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
          <NFormItem label="报告文件">
            <NInput
              v-model:value="form.report_ref"
              :maxlength="LIMITS.report_ref"
              placeholder="知识库报告文件名，不含 .md（如 宁德时代深度研究_2026-11-27）"
            />
          </NFormItem>
          <NFormItem label="摘要">
            <NInput
              v-model:value="form.research_brief"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 5 }"
              :maxlength="LIMITS.research_brief"
              show-count
              placeholder="给三个月后的自己看：当时怎么想、为什么这么判断。不写价格（由数据截止日回放）；换锚/推翻过程写报告 §10.2"
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
