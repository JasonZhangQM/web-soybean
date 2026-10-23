<script setup lang="ts">
/**
 * 档位 Tab：档位版本链 + 按日期新建/改写
 *
 * 语义（这是全页最容易搞错的一点）：**某日档位 = `effective_date <= D` 的最大版**，
 * 不是每日快照。所以：
 * - 选一个**新日期**保存 → 新建一版，那之后的日子都跟这版；
 * - 选一个**已有日期**保存 → 改那一版（会二次确认，明示改的是哪天）。
 *
 * 唯一写入口是 `saveVmVersion`（后端 save_version → refresh_current_pp → 钩子重算 pv_*）。
 * 任何地方都不要直写主表 pp_*。
 */
import { ref, reactive, computed, watch, h } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { saveVmVersion, deleteVmVersion } from '@/service/api';
import VmDataTable from './VmDataTable.vue';

defineOptions({ name: 'VmVersionTab' });

const props = defineProps<{ vmId: number; symbol: string; versions: Api.Irs.VmVersion[] }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();

const saving = ref(false);
const deletingId = ref<number | null>(null);

/** 今天（YYYY-MM-DD），NDatePicker 与后端都按日粒度 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

const form = reactive({
  effective_date: today() as string | null,
  pp_el: null as number | null,
  pp_l: null as number | null,
  pp_m: null as number | null,
  pp_h: null as number | null,
  pp_eh: null as number | null,
  note: '' as string
});

/** 当前表单日期命中的已有版本：非空就意味着「这次保存是改写」 */
const hitVersion = computed(() => props.versions.find(v => v.effective_date === form.effective_date) ?? null);

/** 表单日期所处状态的中文说明 */
const dateHint = computed(() => {
  if (!form.effective_date) return '请选择生效日';
  const d = form.effective_date;
  if (hitVersion.value) return `该日已有版本（${d}）——保存将改写这一版`;
  if (d > today()) return `未来日 ${d}：保存后当前视图不生效，到那天才自动切换`;
  return `新日期 ${d}：保存将新建一版，自该日起生效`;
});

/** 用某一版回填表单（点行上的「沿用此版」） */
function fillFrom(v: Api.Irs.VmVersion) {
  form.effective_date = v.effective_date;
  form.pp_el = v.pp_el != null ? Number(v.pp_el) : null;
  form.pp_l = v.pp_l != null ? Number(v.pp_l) : null;
  form.pp_m = v.pp_m != null ? Number(v.pp_m) : null;
  form.pp_h = v.pp_h != null ? Number(v.pp_h) : null;
  form.pp_eh = v.pp_eh != null ? Number(v.pp_eh) : null;
}

// 打开时用当前生效版预填，避免每次从空白开始
watch(
  () => props.versions,
  list => {
    const cur = list.find(v => v.status === 'current');
    if (cur && form.pp_el == null && form.pp_eh == null) fillFrom(cur);
  },
  { immediate: true }
);

// 「中」自动取低与高的平均：与主表口径一致，减少手填错位
watch(
  () => [form.pp_l, form.pp_h],
  ([low, high]) => {
    form.pp_m = low != null && high != null ? Number(((Number(low) + Number(high)) / 2).toFixed(4)) : null;
  }
);

const canSave = computed(
  () =>
    !!form.effective_date &&
    form.pp_el != null &&
    form.pp_l != null &&
    form.pp_m != null &&
    form.pp_h != null &&
    form.pp_eh != null
);

function doSave(force = false) {
  if (!canSave.value) {
    window.$message?.warning('五档都要填（中可自动取低高平均）');
    return;
  }
  const run = async () => {
    saving.value = true;
    try {
      const { data, error } = await saveVmVersion(props.vmId, {
        symbol: props.symbol,
        effective_date: form.effective_date,
        pp_el: form.pp_el!,
        pp_l: form.pp_l!,
        pp_m: form.pp_m!,
        pp_h: form.pp_h!,
        pp_eh: form.pp_eh!,
        note: form.note || null
      });
      if (!error) {
        const map: Record<string, string> = {
          created: '已新建一版档位',
          updated: '已改写该日档位',
          unchanged: '五档没变，未新建版本'
        };
        window.$message?.success(map[data?.action ?? ''] ?? '已保存');
        // 保存后清掉 note，但保留日期与五档，方便连续微调
        form.note = '';
        emit('refresh');
      }
    } finally {
      saving.value = false;
    }
  };

  if (force || !hitVersion.value) {
    run();
    return;
  }
  // 改写历史版本：必须明示「改的是哪天」，不做软删除也不做静默覆盖
  window.$dialog?.warning({
    title: `将改写 ${form.effective_date} 这一版档位`,
    content: `原来：极低 ${fmt(hitVersion.value.pp_el)} / 低 ${fmt(hitVersion.value.pp_l)} / 中 ${fmt(
      hitVersion.value.pp_m
    )} / 高 ${fmt(hitVersion.value.pp_h)} / 极高 ${fmt(hitVersion.value.pp_eh)}。改写后该日之后（直到下一版）的档位全部跟着变。历史不会留痕，确认？`,
    positiveText: '确认改写',
    negativeText: '取消',
    onPositiveClick: run
  });
}

function handleDelete(v: Api.Irs.VmVersion) {
  window.$dialog?.warning({
    title: `删除 ${v.effective_date} 这一版档位？`,
    content: '删的是「某一版档位」，不是删标的。删完主表会按剩余版本里日期最新的一版回写五档。',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingId.value = v.id;
      try {
        const { error } = await deleteVmVersion(props.vmId, v.id);
        if (!error) {
          window.$message?.success('已删除该版并回写当前档位');
          emit('refresh');
        }
      } finally {
        deletingId.value = null;
      }
    }
  });
}

function fmt(v: number | string | null | undefined) {
  if (v == null) return '-';
  return String(
    Number(v)
      .toFixed(4)
      .replace(/\.?0+$/, '')
  );
}

/** diff 里正负都要显式带符号，涨跌一眼可见 */
function fmtDiff(v: number | null | undefined) {
  if (v == null) return '—';
  const n = Number(v);
  if (n === 0) return '0';
  return `${n > 0 ? '+' : ''}${n.toFixed(4).replace(/\.?0+$/, '')}`;
}

const statusText: Record<string, string> = { current: '生效中', history: '历史', pending: '未来日' };
const statusType: Record<string, 'success' | 'default' | 'warning'> = {
  current: 'success',
  history: 'default',
  pending: 'warning'
};

// ---------------- 分页 ----------------
/**
 * 每页 10 条：页大小交给共用 `VmDataTable`（与列表页同款分页器），
 * 它内部还负责页码钳制 —— 删掉一版后 `versions` 变短，页码会自动回退，
 * 不会停在一张空白页上。
 */
const PAGE_SIZE = 10;

const columns = [
  { title: '生效日', key: 'effective_date', width: 110 },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row: Api.Irs.VmVersion) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: statusType[row.status] ?? 'default' },
        { default: () => statusText[row.status] ?? row.status }
      )
  },
  { title: '极低', key: 'pp_el', width: 90, align: 'right' as const, render: (r: Api.Irs.VmVersion) => fmt(r.pp_el) },
  { title: '低', key: 'pp_l', width: 90, align: 'right' as const, render: (r: Api.Irs.VmVersion) => fmt(r.pp_l) },
  { title: '中', key: 'pp_m', width: 90, align: 'right' as const, render: (r: Api.Irs.VmVersion) => fmt(r.pp_m) },
  { title: '高', key: 'pp_h', width: 90, align: 'right' as const, render: (r: Api.Irs.VmVersion) => fmt(r.pp_h) },
  { title: '极高', key: 'pp_eh', width: 90, align: 'right' as const, render: (r: Api.Irs.VmVersion) => fmt(r.pp_eh) },
  {
    title: '相对上一版（低/中/高）',
    key: 'diff',
    width: 200,
    render: (r: Api.Irs.VmVersion) =>
      h('span', { class: 'text-12px text-gray-500' }, [
        fmtDiff(r.diff?.pp_l),
        ' / ',
        fmtDiff(r.diff?.pp_m),
        ' / ',
        fmtDiff(r.diff?.pp_h)
      ])
  },
  {
    title: '备注',
    key: 'note',
    width: 200,
    ellipsis: { tooltip: true },
    render: (r: Api.Irs.VmVersion) => r.note || '-'
  },
  {
    title: '操作',
    key: 'action',
    width: 150,
    render: (r: Api.Irs.VmVersion) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          { text: true, size: 'tiny', type: 'primary', onClick: () => fillFrom(r) },
          { default: () => '沿用此版' }
        ),
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            type: 'error',
            loading: deletingId.value === r.id,
            onClick: () => handleDelete(r)
          },
          { default: () => '删除' }
        )
      ])
  }
];
</script>

<template>
  <div>
    <NAlert type="info" :bordered="false" class="mb-12px">
      某日档位 =
      <b>生效日 ≤ 该日 的最大一版</b>
      ，不是每日快照。选新日期 = 新建一版；选已有日期 = 改那一版。 改档位后，引用档位的计划（触发点写「低 / 中 /
      高」的）会自动跟随新值，
      <b>不用逐条改计划</b>
      。
    </NAlert>

    <VmDataTable :columns="columns" :data="versions" :page-size="PAGE_SIZE" />

    <NDivider />

    <div class="mb-8px font-500">保存一版档位</div>
    <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap items-end gap-12px">
      <NFormItem label="生效日">
        <NDatePicker
          v-model:formatted-value="form.effective_date"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          style="width: 150px"
        />
      </NFormItem>
      <NFormItem label="极低">
        <NInputNumber v-model:value="form.pp_el" :precision="4" :step="0.0001" style="width: 120px" />
      </NFormItem>
      <NFormItem label="低">
        <NInputNumber v-model:value="form.pp_l" :precision="4" :step="0.0001" style="width: 120px" />
      </NFormItem>
      <NFormItem label="中">
        <NInputNumber v-model:value="form.pp_m" :precision="4" :step="0.0001" disabled style="width: 120px" />
      </NFormItem>
      <NFormItem label="高">
        <NInputNumber v-model:value="form.pp_h" :precision="4" :step="0.0001" style="width: 120px" />
      </NFormItem>
      <NFormItem label="极高">
        <NInputNumber v-model:value="form.pp_eh" :precision="4" :step="0.0001" style="width: 120px" />
      </NFormItem>
      <NFormItem label="备注" style="flex: 1; min-width: 240px">
        <NInput v-model:value="form.note" placeholder="为什么调：如 三季报后下调中枢" />
      </NFormItem>
      <NFormItem>
        <NButton type="primary" :loading="saving" :disabled="!canSave" @click="doSave()">保存</NButton>
      </NFormItem>
    </NForm>
    <div class="text-12px" :class="hitVersion ? 'text-orange-500' : 'text-gray-400'">{{ dateHint }}</div>
  </div>
</template>
