<script setup lang="ts">
/**
 * 逻辑与证伪 Tab（批次一只读）
 *
 * 这些数据是迁移过来的（`irs_vm_logic` / `irs_vm_invalidate`），接口已通，
 * 但编辑入口按分期放在批次二——先把"看得见"做出来，避免栏位一开放就变回散文筐。
 *
 * 一条硬规则在这里可视化：**证伪信号必须可量化**。后端按
 * `[><≥≤=]\s*\d` 或 `\d+\s*%` 判定，判定不过的整行标红——"分位偏高"这类说法不算填了。
 */
import { h } from 'vue';
import { NTag } from 'naive-ui';
import VmDataTable from './VmDataTable.vue';

defineOptions({ name: 'VmLogicTab' });

defineProps<{
  logic: Api.Irs.VmLogic[];
  invalidate: Api.Irs.VmInvalidate[];
}>();

const stateType: Record<string, 'success' | 'warning' | 'error'> = {
  完好: 'success',
  受损: 'warning',
  破坏: 'error'
};

const logicColumns = [
  { title: '序', key: 'seq', width: 50 },
  {
    title: '投资逻辑',
    key: 'content',
    minWidth: 240,
    render: (r: Api.Irs.VmLogic) => h('div', { style: 'white-space: pre-wrap' }, r.content)
  },
  {
    title: '定价依据',
    key: 'pricing',
    width: 200,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmLogic) => r.pricing || '-'
  },
  {
    title: '状态',
    key: 'state',
    width: 90,
    render: (r: Api.Irs.VmLogic) =>
      h(NTag, { size: 'small', bordered: false, type: stateType[r.state] ?? 'default' }, { default: () => r.state })
  },
  {
    title: '状态变更',
    key: 'state_at',
    width: 150,
    render: (r: Api.Irs.VmLogic) => (r.state_at ? r.state_at.replace('T', ' ').slice(0, 16) : '-')
  },
  {
    title: '证据',
    key: 'evidence',
    width: 200,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmLogic) => r.evidence || '-'
  }
];

const invalidateColumns = [
  { title: '序', key: 'seq', width: 50 },
  { title: '命题', key: 'proposition', width: 220, ellipsis: { tooltip: true } },
  {
    title: '证伪信号',
    key: 'signal',
    minWidth: 240,
    render: (r: Api.Irs.VmInvalidate) =>
      h('div', { class: 'flex items-center gap-6px' }, [
        h('span', { class: r.quantified ? '' : 'text-red-500' }, r.signal),
        // 没有数字阈值 = 没填。用标签而不是只标红，是因为"红字"常常被当成配色
        r.quantified ? null : h(NTag, { size: 'tiny', bordered: false, type: 'error' }, { default: () => '不可量化' })
      ])
  },
  {
    title: '来源',
    key: 'source',
    width: 140,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmInvalidate) => r.source || '-'
  },
  {
    title: '动作',
    key: 'action',
    width: 140,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmInvalidate) => r.action || '-'
  },
  { title: '状态', key: 'status', width: 90 },
  {
    title: '触发日',
    key: 'triggered_at',
    width: 110,
    render: (r: Api.Irs.VmInvalidate) => r.triggered_at || '-'
  }
];
</script>

<template>
  <div>
    <NAlert type="warning" :bordered="false" class="mb-12px">
      证伪信号必须可量化（出现「比较符 + 数字」或「数字%」）。「分位偏高」不算填了——它的阈值
      不可判定，标「不可量化」并标红。
    </NAlert>

    <div class="mb-8px font-500">投资逻辑（{{ logic.length }} 条）</div>
    <VmDataTable :columns="logicColumns" :data="logic" :page-size="10" />
    <NEmpty v-if="!logic.length" size="small" description="还没有登记投资逻辑" class="my-8px" />

    <NDivider />

    <div class="mb-8px font-500">证伪条件（{{ invalidate.length }} 条）</div>
    <VmDataTable :columns="invalidateColumns" :data="invalidate" :page-size="10" />
    <NEmpty v-if="!invalidate.length" size="small" description="还没有登记证伪条件" class="my-8px" />
  </div>
</template>
