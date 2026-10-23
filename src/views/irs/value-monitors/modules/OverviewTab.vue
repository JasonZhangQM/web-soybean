<script setup lang="ts">
/**
 * 概览 Tab：决策卡 + 档位摘要 + 计划委托（只读，10 条/页）+ 归属合约
 *
 * 数据全部来自 `GET /value-monitors/{id}/detail`（一次给全，不在 Tab 内再打请求）。
 * 决策卡 8 项的数据源是**最新一条 `irs_vm_research`**，不是主表的 13 列
 * ——主表只留五档，叙述归研究版本。
 */
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NTag } from 'naive-ui';
import type { ValueMonitorDetail } from '@/service/api';
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

/** 计划计数：待执行 / 已执行 / 已放弃 / 已过期 */
const planCount = computed(() => {
  const c = { 待执行: 0, 已执行: 0, 已放弃: 0, 已过期: 0 } as Record<string, number>;
  for (const p of props.detail.plans) c[p.status] = (c[p.status] ?? 0) + 1;
  return c;
});

/** 归属合约的成交合计 */
const tradeTotal = computed(() => props.detail.trades.length);

function fmtNum(v: number | null | undefined) {
  if (v == null) return '-';
  return Number(v)
    .toFixed(4)
    .replace(/\.?0+$/, '');
}

function gotoGroupSymbols() {
  // 合约页读 ?symbol= 精确筛该合约（映射的编辑入口在合约页，不在标的页）
  router.push({ name: 'bills_group-symbols', query: { symbol: props.detail.vm.symbol } });
}

/**
 * 概览里的计划委托表 —— 只读摘要。
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
  { title: '数量', key: 'qty', width: 70, align: 'right' as const, render: (p: Api.Irs.VmPlan) => p.qty ?? '-' },
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
    render: (row: ValueMonitorDetail['groups'][number]) =>
      row.pf_total != null ? Number(row.pf_total).toFixed(2) : '-'
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
      <NButton size="tiny" text type="primary" class="ml-auto" @click="emit('goto', 'research')">
        去研究 Tab 维护
      </NButton>
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

    <!-- 档位摘要 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">当前档位</span>
      <NTag v-if="currentVersion" size="small" :bordered="false">生效 {{ currentVersion.effective_date }}</NTag>
      <NTag v-else size="small" :bordered="false" type="warning">无生效版本</NTag>
      <NTag v-if="pendingVersion" size="small" :bordered="false" type="warning">
        待生效 {{ pendingVersion.effective_date }}（当前不生效）
      </NTag>
      <span class="text-12px text-gray-400">共 {{ detail.versions.length }} 版</span>
      <NButton size="tiny" text type="primary" class="ml-auto" @click="emit('goto', 'version')">
        去档位 Tab 维护
      </NButton>
    </div>

    <NDescriptions v-if="currentVersion" :column="5" label-placement="top" bordered size="small" class="mb-16px">
      <NDescriptionsItem label="极低">{{ fmtNum(currentVersion.pp_el) }}</NDescriptionsItem>
      <NDescriptionsItem label="低">{{ fmtNum(currentVersion.pp_l) }}</NDescriptionsItem>
      <NDescriptionsItem label="中">{{ fmtNum(currentVersion.pp_m) }}</NDescriptionsItem>
      <NDescriptionsItem label="高">{{ fmtNum(currentVersion.pp_h) }}</NDescriptionsItem>
      <NDescriptionsItem label="极高">{{ fmtNum(currentVersion.pp_eh) }}</NDescriptionsItem>
    </NDescriptions>

    <!-- 计划计数 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">计划委托</span>
      <NTag size="small" :bordered="false" type="warning">待执行 {{ planCount['待执行'] ?? 0 }}</NTag>
      <NTag size="small" :bordered="false" type="success">已执行 {{ planCount['已执行'] ?? 0 }}</NTag>
      <NTag v-if="planCount['已过期']" size="small" :bordered="false" type="default">
        已过期 {{ planCount['已过期'] }}
      </NTag>
      <NTag v-if="planCount['已放弃']" size="small" :bordered="false" type="error">
        已放弃 {{ planCount['已放弃'] }}
      </NTag>
      <NButton size="tiny" text type="primary" class="ml-auto" @click="emit('goto', 'plan')">去计划与成交 Tab</NButton>
    </div>

    <!-- 计划委托明细（只读）：10 条/页 -->
    <VmDataTable
      v-if="detail.plans.length"
      :columns="planColumns"
      :data="detail.plans"
      :page-size="10"
      class="mb-8px"
    />

    <!-- 对应交易代码（只读）：映射的编辑入口在合约页，这里只展示 -->
    <div class="mb-8px flex flex-wrap items-center gap-8px">
      <span class="font-500">对应交易代码</span>
      <span class="text-12px text-gray-400">
        {{ detail.groups.length }} 个合约行 / {{ tradeTotal }} 笔成交（融资融券不计）
      </span>
      <NButton size="tiny" text type="primary" class="ml-auto" @click="gotoGroupSymbols">去合约页维护归属</NButton>
    </div>
    <VmDataTable :columns="groupColumns" :data="detail.groups" :page-size="10" />
    <div v-if="!detail.groups.length" class="mt-8px text-12px text-gray-400">
      还没有任何合约行归属到这个标的——到
      <NButton text type="primary" size="tiny" @click="gotoGroupSymbols">合约页</NButton>
      把对应合约行的「归属标的」选上。
    </div>
  </div>
</template>
