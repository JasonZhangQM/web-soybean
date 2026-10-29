<script setup lang="ts">
/**
 * 概览 Tab：决策卡 + 档位摘要 + 剧本（只读，10 条/页）+ 归属合约
 *
 * 数据全部来自 `GET /value-monitors/{id}/detail`（一次给全，不在 Tab 内再打请求）。
 * 决策卡 8 项的数据源是**最新一条 `irs_vm_research`**，不是主表的 13 列
 * ——主表只留五档，叙述归研究版本。
 */
import { computed, h, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NTag } from 'naive-ui';
import { fetchVmGroups, type VmGroup, type ValueMonitorDetail } from '@/service/api';
import VmDataTable from './VmDataTable.vue';
import { STATUS_TYPE, triggerText } from './planFormat';

defineOptions({ name: 'VmOverviewTab' });

const props = defineProps<{ detail: ValueMonitorDetail }>();
const emit = defineEmits<{ (e: 'goto', tab: string): void }>();

const router = useRouter();

/** 最新一版研究（research 已按日期倒序） */
const latestResearch = computed(() => props.detail.research[0] ?? null);

/** 当前生效版档位（versions 里 status='current' 的那条） */
const currentVersion = computed(() => props.detail.versions.find(v => v.status === 'current') ?? null);
/** 最近的未来版（"待生效 X-XX"） */
const pendingVersion = computed(() => props.detail.versions.find(v => v.status === 'pending') ?? null);

const today = new Date().toISOString().slice(0, 10);
/** 复核是否已到期 */
const reviewOverdue = computed(() => {
  const d = latestResearch.value?.next_review;
  return !!d && d < today;
});

/** 剧本计数：生效 / 暂停（暂停 = is_cancelled） */
const planCount = computed(() => {
  const active = props.detail.plans.filter(p => !p.is_cancelled).length;
  const paused = props.detail.plans.filter(p => p.is_cancelled).length;
  return { active, paused };
});

// ---- 对应交易代码：服务端分页（10 条/页，id 倒序）+ 分类精确 / 合约模糊 ----
const groups = ref<VmGroup[]>(props.detail.groups);
const groupTotal = ref(props.detail.groups.length);
const groupPage = ref(1);
const groupPageSize = ref(10);
const categoryFilter = ref<string | null>(null);
const symbolFilter = ref('');
const categoryOptions = computed(() => {
  const set = new Set(props.detail.groups.map(g => g.category));
  return [...set].sort().map(c => ({ label: c, value: c }));
});
const hasGroupFilter = computed(() => categoryFilter.value != null || !!symbolFilter.value.trim());

async function loadGroups(targetPage = groupPage.value) {
  const { data, error } = await fetchVmGroups(props.detail.vm.id, {
    page: targetPage,
    pageSize: groupPageSize.value,
    category: categoryFilter.value,
    symbol: symbolFilter.value.trim()
  });
  if (error || !data) return;
  if (!data.items.length && targetPage > 1) {
    await loadGroups(1);
    return;
  }
  groups.value = data.items;
  groupTotal.value = data.total;
}

function searchGroupsFromFirst() {
  groupPage.value = 1;
  loadGroups(1);
}

function handleGroupPageChange(p: number) {
  groupPage.value = p;
  loadGroups(p);
}

function handleGroupPageSizeChange(size: number) {
  groupPageSize.value = size;
  groupPage.value = 1;
  loadGroups(1);
}

/** 合约是输入框：回车 / 清空才触发，避免每敲一个字就打一次接口 */
function handleSymbolInput(value: string) {
  if (!value) searchGroupsFromFirst();
}

function resetGroupFilters() {
  categoryFilter.value = null;
  symbolFilter.value = '';
  searchGroupsFromFirst();
}

onMounted(() => loadGroups(1));

/**
 * 逻辑 / 证伪摘要（方案 A 第 1 条：概览要能看出"档案更没更新"）。
 *
 * 只做计数，不做内容预览：概览的作用是判断"要不要点进去"，不是读正文。
 * 纲领要求逻辑 2-4 条、证伪 ≥3 条，所以低于下限用橙色提示——但不拦保存。
 */
const logicStat = computed(() => {
  const c: Record<string, number> = { 完好: 0, 减弱: 0, 破坏: 0 };
  for (const l of props.detail.logic) c[l.state] = (c[l.state] ?? 0) + 1;
  return c;
});
const invStat = computed(() => {
  const c: Record<string, number> = { 未触发: 0, 已触发: 0, 已失效: 0 };
  for (const i of props.detail.invalidate) c[i.status] = (c[i.status] ?? 0) + 1;
  return c;
});
/** 证伪信号里没有数字阈值的条数（不可量化 = 复盘时算没填） */
const invUnquantified = computed(() => props.detail.invalidate.filter(i => !i.quantified).length);

function fmtNum(v: number | null | undefined) {
  if (v == null) return '-';
  return Number(v)
    .toFixed(4)
    .replace(/\.?0+$/, '');
}

function gotoGroupSymbols() {
  // 纯跳转：不带 query，合约页保持它自己的默认筛选
  router.push({ name: 'bills_group-symbols' });
}

/**
 * 概览里的剧本表 —— 只读摘要。
 *
 * 页大小 10 条：与抽屉内其他表、列表页默认值统一（原先单独取 6 是为了省高度，
 * 但多一个不一样的数字，用户每换一张表都要重新适应；统一后只看一次就记住了）。
 * 分页器、行高、表头样式全部来自共用组件 `VmDataTable`，与列表页同款。
 */
const planColumns = [
  { title: '序', key: 'seq', width: 50 },
  {
    title: '合约',
    key: 'trade_symbol',
    width: 170,
    render: (p: Api.Irs.VmPlan) => h('span', { style: 'user-select: text' }, p.trade_symbol)
  },
  { title: '方向', key: 'dir', width: 70, render: (p: Api.Irs.VmPlan) => `${p.b_s}${p.o_c ?? ''}` },
  {
    title: '触发条件',
    key: 'trigger',
    // 用 width 而非 minWidth：scroll-x 要的是精确列宽和，minWidth 无从求和
    width: 240,
    render: (p: Api.Irs.VmPlan) => h('span', { class: 'text-12px' }, triggerText(p))
  },
  { title: '每次手数', key: 'qty', width: 70, align: 'right' as const, render: (p: Api.Irs.VmPlan) => p.qty ?? '-' },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (p: Api.Irs.VmPlan) =>
      h(NTag, { size: 'small', bordered: false, type: STATUS_TYPE[p.status] ?? 'default' }, { default: () => p.status })
  }
];

const groupColumns = [
  { title: '分类', key: 'category', width: 80 },
  { title: '合约代码', key: 'symbol', width: 180 },
  { title: '成交笔数', key: 'bill_rows', width: 90, align: 'right' as const },
  { title: '组内笔数', key: 'count', width: 90, align: 'right' as const },
  {
    title: '浮动盈亏',
    key: 'pf_total',
    width: 120,
    align: 'right' as const,
    render: (row: VmGroup) => (row.pf_total != null ? Number(row.pf_total).toFixed(2) : '-')
  }
];
</script>

<template>
  <div>
    <!-- 决策卡：数据源 = 最新一条研究版本 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">决策卡</span>
      <NTag v-if="latestResearch" size="small" :bordered="false" type="info">
        研究定稿 {{ latestResearch.research_date }}
      </NTag>
      <NTag v-else size="small" :bordered="false" type="warning">还没做过研究</NTag>
      <NTag v-if="reviewOverdue" size="small" :bordered="false" type="error">
        复核已到期（{{ latestResearch?.next_review }}）
      </NTag>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'research')">去研究 Tab 维护</NButton>
    </div>

    <!--
      label-style 固定 label 列宽：naive-ui 的 NDescriptions 没有 label-width 属性
      （只有 label-style / label-class），不给宽度时 th 按内容争抢，会被压到只剩一个字。
      92px = 四个汉字 56px + th 左右 padding 24px（8px 12px）再留 12px 余量，
      所以「核心论点」「前提条件」这类四字 label 也单行，不会折成两行。
    -->
    <NDescriptions
      v-if="latestResearch"
      :column="2"
      label-placement="left"
      bordered
      size="small"
      :label-style="{ width: '92px' }"
      class="mb-16px"
    >
      <NDescriptionsItem label="结论" :span="2">
        <span class="font-500">{{ latestResearch.conclusion || '未填' }}</span>
      </NDescriptionsItem>
      <NDescriptionsItem label="核心论点" :span="2">
        {{ latestResearch.thesis || '未填' }}
      </NDescriptionsItem>
      <NDescriptionsItem label="最大风险">
        {{ latestResearch.max_risk || '未填' }}
      </NDescriptionsItem>
      <NDescriptionsItem label="预期差">
        {{ latestResearch.expectation_gap || '未填' }}
      </NDescriptionsItem>
      <NDescriptionsItem label="前提条件" :span="2">
        {{ latestResearch.pre_condition || '未填' }}
      </NDescriptionsItem>
      <NDescriptionsItem label="下次复核">
        <span :class="reviewOverdue ? 'text-red-500' : ''">
          {{ latestResearch.next_review || '未填' }}
        </span>
      </NDescriptionsItem>
      <NDescriptionsItem label="研究笔记">
        {{ latestResearch.research_note || '未填' }}
      </NDescriptionsItem>
      <NDescriptionsItem label="摘要" :span="2">
        <div style="white-space: pre-wrap">{{ latestResearch.research_brief || '未填' }}</div>
      </NDescriptionsItem>
    </NDescriptions>

    <NAlert v-else type="info" :bordered="false" class="mb-16px">
      这个标的还没有研究版本。概览的 8 项决策卡取自最新一条研究，请到「研究」Tab 按日期新建一版。
    </NAlert>

    <NDivider />

    <!--
      逻辑与证伪摘要：研究的结论能不能用，取决于底下挂了什么逻辑、什么判据。
      纲领要求逻辑 2-4 条、证伪 ≥3 条，低于下限标橙（只提示，不阻断录入）。
    -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">逻辑与证伪</span>
      <NTag
        size="small"
        :bordered="false"
        :type="logicStat['破坏'] ? 'error' : detail.logic.length < 2 ? 'warning' : 'default'"
      >
        逻辑 {{ detail.logic.length }} 条
        <template v-if="logicStat['减弱']">（减弱 {{ logicStat['减弱'] }}）</template>
        <template v-if="logicStat['破坏']">（破坏 {{ logicStat['破坏'] }}）</template>
      </NTag>
      <NTag
        size="small"
        :bordered="false"
        :type="invStat['已触发'] ? 'error' : detail.invalidate.length < 3 ? 'warning' : 'default'"
      >
        证伪 {{ detail.invalidate.length }} 条（已触发 {{ invStat['已触发'] }}）
      </NTag>
      <NTag v-if="invUnquantified" size="small" :bordered="false" type="warning">不可量化 {{ invUnquantified }}</NTag>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'logic')">去逻辑与证伪 Tab</NButton>
    </div>

    <NDivider />

    <!-- 档位摘要 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">当前档位</span>
      <NTag v-if="currentVersion" size="small" :bordered="false">生效 {{ currentVersion.effective_date }}</NTag>
      <NTag v-else size="small" :bordered="false" type="warning">无生效版本</NTag>
      <NTag v-if="pendingVersion" size="small" :bordered="false" type="warning">
        待生效 {{ pendingVersion.effective_date }}（当前不生效）
      </NTag>
      <span class="text-12px text-gray-400">共 {{ detail.versions.length }} 版</span>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'version')">去档位 Tab 维护</NButton>
    </div>

    <NDescriptions v-if="currentVersion" :column="5" label-placement="top" bordered size="small" class="mb-16px">
      <NDescriptionsItem label="极低">{{ fmtNum(currentVersion.pp_el) }}</NDescriptionsItem>
      <NDescriptionsItem label="低">{{ fmtNum(currentVersion.pp_l) }}</NDescriptionsItem>
      <NDescriptionsItem label="中">{{ fmtNum(currentVersion.pp_m) }}</NDescriptionsItem>
      <NDescriptionsItem label="高">{{ fmtNum(currentVersion.pp_h) }}</NDescriptionsItem>
      <NDescriptionsItem label="极高">{{ fmtNum(currentVersion.pp_eh) }}</NDescriptionsItem>
    </NDescriptions>

    <NDivider />

    <!-- 剧本计数 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">剧本</span>
      <NTag size="small" :bordered="false" type="success">生效 {{ planCount.active }}</NTag>
      <NTag size="small" :bordered="false" type="default">暂停 {{ planCount.paused }}</NTag>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'plan')">去剧本与成交 Tab</NButton>
    </div>

    <!-- 剧本明细（只读）：10 条/页 -->
    <VmDataTable
      v-if="detail.plans.length"
      :columns="planColumns"
      :data="detail.plans"
      :page-size="10"
      class="mb-8px"
    />

    <NDivider />

    <!-- 对应交易代码（只读）：映射的编辑入口在合约页，这里只展示 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">对应交易代码</span>
      <NSelect
        v-model:value="categoryFilter"
        :options="categoryOptions"
        clearable
        size="small"
        placeholder="按分类筛选"
        style="width: 150px"
        @update:value="searchGroupsFromFirst"
      />
      <NInput
        v-model:value="symbolFilter"
        clearable
        size="small"
        placeholder="合约代码模糊筛选，回车"
        style="width: 200px"
        @update:value="handleSymbolInput"
        @keyup.enter="searchGroupsFromFirst"
      />
      <NButton size="small" @click="searchGroupsFromFirst">搜索</NButton>
      <NButton size="small" @click="resetGroupFilters">重置</NButton>
      <span class="text-12px text-gray-400">共 {{ groupTotal }} 个合约行（融资融券不计）</span>
      <NButton size="tiny" text class="ml-auto" @click="gotoGroupSymbols">去合约页维护归属</NButton>
    </div>
    <VmDataTable :columns="groupColumns" :data="groups" :page-size="0" />
    <div class="mt-8px flex justify-end">
      <NPagination
        :page="groupPage"
        :page-size="groupPageSize"
        :item-count="groupTotal"
        :page-sizes="[10, 20, 50, 100]"
        :prefix="() => `共 ${groupTotal} 个合约行`"
        show-size-picker
        @update:page="handleGroupPageChange"
        @update:page-size="handleGroupPageSizeChange"
      />
    </div>
    <NEmpty
      v-if="!groups.length"
      size="small"
      :description="hasGroupFilter ? '没有符合筛选条件的合约行' : '还没有任何合约行归属到这个标的'"
      class="my-8px"
    />
    <div v-if="!groups.length && !hasGroupFilter" class="mt-8px text-12px text-gray-400">
      到
      <NButton text size="tiny" @click="gotoGroupSymbols">合约页</NButton>
      把对应合约行的「归属标的」选上。
    </div>
  </div>
</template>
