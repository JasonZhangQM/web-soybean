<script setup lang="ts">
/**
 * 概览 Tab：决策卡 + 档位摘要 + 剧本摘要 + 归属合约（分页）
 *
 * 数据全部来自瘦身版 `GET /value-monitors/{id}/detail`（概览最小集）。
 * 各 Tab 明细走懒加载接口（versions/research/logic/invalidate/plans/groups）。
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

/** 最新一版研究（瘦身版 detail 直接给） */
const latestResearch = computed(() => props.detail.latest_research);

/** 当前生效版档位（瘦身版 detail 直接给五档 + 生效日期） */
const currentVersion = computed(() => props.detail.current_version);

const today = new Date().toISOString().slice(0, 10);
/** 复核是否已到期 */
const reviewOverdue = computed(() => {
  const d = latestResearch.value?.next_review;
  return !!d && d < today;
});

/** 剧本计数：生效 / 暂停 */
const planCount = computed(() => ({
  active: props.detail.plans_active_count,
  paused: props.detail.plans_total_count - props.detail.plans_active_count
}));

// ---- 对应交易代码：服务端分页（10 条/页，id 倒序）+ 分类精确 / 合约模糊 ----
const groups = ref<VmGroup[]>([]);
const groupTotal = ref(props.detail.group_rows);
const groupPage = ref(1);
const groupPageSize = ref(10);
const categoryFilter = ref<string | null>(null);
const symbolFilter = ref('');
const categoryOptions = computed(() => {
  const set = new Set(groups.value.map(g => g.category));
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
 * 概览里的剧本表 —— 只读摘要（前 10 条）。
 *
 * 剧本全量在「剧本与成交」Tab，这里只展示瘦身版 detail 返回的前 10 条。
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
  { title: '成交笔数', key: 'bill_rows', width: 80, align: 'right' as const },
  { title: '组内笔数', key: 'count', width: 70, align: 'right' as const },
  {
    title: '持仓量',
    key: 'p_total',
    width: 80,
    align: 'right' as const,
    render: (row: VmGroup) => (row.p_total != null ? Number(row.p_total).toLocaleString() : '-')
  },
  {
    title: '持仓成本',
    key: 'cost_total',
    width: 110,
    align: 'right' as const,
    render: (row: VmGroup) => (row.cost_total != null ? Number(row.cost_total).toFixed(2) : '-')
  },
  {
    title: '最新价',
    key: 'price',
    width: 100,
    align: 'right' as const,
    render: (row: VmGroup) =>
      row.price != null
        ? Number(row.price)
            .toFixed(4)
            .replace(/\.?0+$/, '')
        : '-'
  },
  {
    title: '乘数',
    key: 'multiplier',
    width: 70,
    align: 'right' as const,
    render: (row: VmGroup) => (row.multiplier != null ? row.multiplier : '-')
  },
  {
    title: '市值',
    key: 'value_total',
    width: 110,
    align: 'right' as const,
    render: (row: VmGroup) => (row.value_total != null ? Number(row.value_total).toFixed(2) : '-')
  },
  {
    title: '浮动盈亏',
    key: 'pf_total',
    width: 110,
    align: 'right' as const,
    render: (row: VmGroup) => (row.pf_total != null ? Number(row.pf_total).toFixed(2) : '-')
  },
  {
    title: '平仓盈亏',
    key: 'pl_all',
    width: 110,
    align: 'right' as const,
    render: (row: VmGroup) => (row.pl_all != null ? Number(row.pl_all).toFixed(2) : '-')
  },
  {
    title: '盈亏合计',
    key: 'pfl_all',
    width: 110,
    align: 'right' as const,
    render: (row: VmGroup) => (row.pfl_all != null ? Number(row.pfl_all).toFixed(2) : '-')
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
      概览只展示计数（轻量），状态分布留给「逻辑与证伪」Tab 看全量。
      纲领要求逻辑 2-4 条、证伪 ≥3 条，低于下限标橙（只提示，不阻断录入）。
    -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">逻辑与证伪</span>
      <NTag size="small" :bordered="false" :type="detail.logic_total_count < 2 ? 'warning' : 'default'">
        逻辑 {{ detail.logic_total_count }} 条
      </NTag>
      <NTag size="small" :bordered="false" :type="detail.invalidate_total_count < 3 ? 'warning' : 'default'">
        证伪 {{ detail.invalidate_total_count }} 条
      </NTag>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'logic')">去逻辑与证伪 Tab</NButton>
    </div>

    <NDivider />

    <!-- 档位摘要 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">当前档位</span>
      <NTag v-if="currentVersion" size="small" :bordered="false">生效 {{ currentVersion.effective_date }}</NTag>
      <NTag v-else size="small" :bordered="false" type="warning">无生效版本</NTag>
      <span v-if="currentVersion?.note" class="text-12px text-gray-400">备注：{{ currentVersion.note }}</span>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'version')">去档位 Tab 维护</NButton>
    </div>

    <!-- 档位摘要：五档从主表 vm 取（current_version 只给生效日期 + 备注） -->
    <NDescriptions v-if="currentVersion" :column="5" label-placement="top" bordered size="small" class="mb-16px">
      <NDescriptionsItem label="极低">{{ fmtNum(detail.vm.pp_el) }}</NDescriptionsItem>
      <NDescriptionsItem label="低">{{ fmtNum(detail.vm.pp_l) }}</NDescriptionsItem>
      <NDescriptionsItem label="中">{{ fmtNum(detail.vm.pp_m) }}</NDescriptionsItem>
      <NDescriptionsItem label="高">{{ fmtNum(detail.vm.pp_h) }}</NDescriptionsItem>
      <NDescriptionsItem label="极高">{{ fmtNum(detail.vm.pp_eh) }}</NDescriptionsItem>
    </NDescriptions>

    <NDivider />

    <!-- 剧本计数 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">剧本</span>
      <NTag size="small" :bordered="false" type="success">生效 {{ planCount.active }}</NTag>
      <NTag size="small" :bordered="false" type="default">暂停 {{ planCount.paused }}</NTag>
      <NButton size="tiny" text class="ml-auto" @click="emit('goto', 'plan')">去剧本与成交 Tab</NButton>
    </div>

    <!-- 剧本明细（只读）：瘦身版 detail 给前 10 条，全量在「剧本与成交」Tab -->
    <VmDataTable
      v-if="detail.plans_preview.length"
      :columns="planColumns"
      :data="detail.plans_preview"
      :page-size="0"
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
