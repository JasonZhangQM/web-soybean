<script setup lang="ts">
/**
 * 档位 Tab：档位版本链 + 到档情景（2026-11-09 两个 Tab 合并）
 *
 * 语义（这是全页最容易搞错的一点）：**某日档位 = `effective_date <= D` 的最大版**，
 * 不是每日快照。所以：
 * - 选一个**新日期**保存 → 新建一版，那之后的日子都跟这版；
 * - 选一个**已有日期**保存 → 改那一版（会二次确认，明示改的是哪天）。
 *
 * 唯一写入口是 `saveUnderlyingVersion`（后端 save_version → refresh_current_pp → 钩子重算 pv_*）。
 * 任何地方都不要直写主表 pp_*。
 *
 * 录入统一走左侧抽屉（与 LogicTab / PlanTab / ReviewTab 同规格）：顶部「新增档位版本」
 * + 行内「编辑」共用同一个抽屉；编辑锁生效日，避免按日期 upsert 时误复制成新一版。
 *
 * 「到档情景」默认折叠，展开才挂载子组件并发一次 /level-scenario（五档 × 双时点 × 全持仓）。
 * 保存档位成功后若情景已展开，主动重拉一次，避免主表 pp_* 已改而情景仍是旧数。
 */
import { ref, reactive, computed, watch, h, onMounted } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { fetchUnderlyingVersions, saveUnderlyingVersion, deleteUnderlyingVersion } from '@/service/api';
import UnderlyingDataTable from './UnderlyingDataTable.vue';
import LevelScenarioTab from './LevelScenarioTab.vue';

defineOptions({ name: 'UnderlyingVersionTab' });

const props = defineProps<{ umId: number; symbol: string }>();
const emit = defineEmits<{ (e: 'dirty'): void }>();

const saving = ref(false);
const deletingId = ref<number | null>(null);
/** P2-4 档位分位校验告警：保存后若后端返回 warnings，显示红标 */
const warnings = ref<Array<{ level: string; pb_pct: number; message: string }>>([]);

/** 左侧录入抽屉：editingDate=null 表示新增，非 null 表示改写该日版本（生效日锁定） */
const showDrawer = ref(false);
const editingDate = ref<string | null>(null);
/** 到档情景折叠区：空数组 = 折叠，不挂载组件、不发请求 */
const scenarioExpanded = ref<string[]>([]);
const scenarioRef = ref<InstanceType<typeof LevelScenarioTab> | null>(null);

// 自管数据（懒加载，切到本 Tab 时 onMounted 拉）
const versions = ref<Api.Irs.UnderlyingVersion[]>([]);

async function loadVersions() {
  const { data, error } = await fetchUnderlyingVersions(props.umId);
  if (!error && data) versions.value = data;
}

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
const hitVersion = computed(() => versions.value.find(v => v.effective_date === form.effective_date) ?? null);

/** 表单日期所处状态的中文说明 */
const dateHint = computed(() => {
  if (editingDate.value) return `编辑 ${editingDate.value} 这一版（生效日锁定）——保存将改写该日档位`;
  if (!form.effective_date) return '请选择生效日';
  const d = form.effective_date;
  if (hitVersion.value) return `该日已有版本（${d}）——保存将改写这一版`;
  if (d > today()) return `未来日 ${d}：保存后当前视图不生效，到那天才自动切换`;
  return `新日期 ${d}：保存将新建一版，自该日起生效`;
});

/** 用某一版回填五档与日期 */
function fillFrom(v: Api.Irs.UnderlyingVersion) {
  form.effective_date = v.effective_date;
  form.pp_el = v.pp_el != null ? Number(v.pp_el) : null;
  form.pp_l = v.pp_l != null ? Number(v.pp_l) : null;
  form.pp_m = v.pp_m != null ? Number(v.pp_m) : null;
  form.pp_h = v.pp_h != null ? Number(v.pp_h) : null;
  form.pp_eh = v.pp_eh != null ? Number(v.pp_eh) : null;
}

function clearLevels() {
  form.pp_el = null;
  form.pp_l = null;
  form.pp_m = null;
  form.pp_h = null;
  form.pp_eh = null;
}

/** 新增：默认拿当前生效版五档预填、日期设今天；传 template 时以该版为模板「沿用新建」 */
function openNew(template?: Api.Irs.UnderlyingVersion) {
  editingDate.value = null;
  const base = template ?? versions.value.find(v => v.status === 'current') ?? null;
  if (base) fillFrom(base);
  else clearLevels();
  form.effective_date = today();
  form.note = '';
  warnings.value = [];
  showDrawer.value = true;
}

/** 编辑：回填该版全部字段，生效日锁定（后端按 (symbol, effective_date) upsert） */
function openEdit(v: Api.Irs.UnderlyingVersion) {
  editingDate.value = v.effective_date;
  fillFrom(v);
  form.note = v.note ?? '';
  warnings.value = [];
  showDrawer.value = true;
}

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
      const { data, error } = await saveUnderlyingVersion(props.umId, {
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
        // P2-4：捕获后端返回的档位分位校验告警（留在主区，关抽屉后仍可见）
        warnings.value = (data?.warnings as Array<{ level: string; pb_pct: number; message: string }>) ?? [];
        // 保存后清掉 note，但保留日期与五档，方便连续微调
        form.note = '';
        // 只刷 versions + 标记 dirty（抽屉关闭时才全量刷列表）
        await loadVersions();
        emit('dirty');
        // 主表 pp_* 已被 refresh_current_pp 刷新：情景若已展开则重算，未展开不发请求
        scenarioRef.value?.load();
        // 失败时保持抽屉打开，不丢已填内容
        showDrawer.value = false;
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

function handleDelete(v: Api.Irs.UnderlyingVersion) {
  window.$dialog?.warning({
    title: `删除 ${v.effective_date} 这一版档位？`,
    content: '删的是「某一版档位」，不是删标的。删完主表会按剩余版本里日期最新的一版回写五档。',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingId.value = v.id;
      try {
        const { error } = await deleteUnderlyingVersion(props.umId, v.id);
        if (!error) {
          window.$message?.success('已删除该版并回写当前档位');
          await loadVersions();
          emit('dirty');
          scenarioRef.value?.load();
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

onMounted(loadVersions);

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
 * 每页 10 条：页大小交给共用 `UnderlyingDataTable`（与列表页同款分页器），
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
    render: (row: Api.Irs.UnderlyingVersion) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: statusType[row.status] ?? 'default' },
        { default: () => statusText[row.status] ?? row.status }
      )
  },
  {
    title: '极低',
    key: 'pp_el',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Irs.UnderlyingVersion) => fmt(r.pp_el)
  },
  {
    title: '低',
    key: 'pp_l',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Irs.UnderlyingVersion) => fmt(r.pp_l)
  },
  {
    title: '中',
    key: 'pp_m',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Irs.UnderlyingVersion) => fmt(r.pp_m)
  },
  {
    title: '高',
    key: 'pp_h',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Irs.UnderlyingVersion) => fmt(r.pp_h)
  },
  {
    title: '极高',
    key: 'pp_eh',
    width: 90,
    align: 'right' as const,
    render: (r: Api.Irs.UnderlyingVersion) => fmt(r.pp_eh)
  },
  {
    title: '相对上一版（低/中/高）',
    key: 'diff',
    width: 200,
    render: (r: Api.Irs.UnderlyingVersion) =>
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
    render: (r: Api.Irs.UnderlyingVersion) => r.note || '-'
  },
  {
    title: '操作',
    key: 'action',
    width: 200,
    render: (r: Api.Irs.UnderlyingVersion) =>
      h('div', { class: 'flex gap-8px' }, [
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            title: '以该版五档为模板新建，生效日设为今天；若今天已有版本则为改写',
            onClick: () => openNew(r)
          },
          { default: () => '沿用新建' }
        ),
        h(
          NButton,
          { text: true, size: 'tiny', type: 'primary', onClick: () => openEdit(r) },
          { default: () => '编辑' }
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

    <div class="mb-8px flex items-center gap-8px">
      <span class="font-500">档位版本</span>
      <NButton size="tiny" class="ml-auto" @click="openNew()">新增档位版本</NButton>
    </div>

    <UnderlyingDataTable :columns="columns" :data="versions" :page-size="PAGE_SIZE" />

    <!-- P2-4 档位分位校验告警（只提示，绝不自动改档位） -->
    <NAlert
      v-if="warnings.length"
      type="warning"
      :bordered="false"
      class="mt-8px"
      title="档位分位校验提示（只提示，不自动改档位）"
    >
      <ul class="mt-4px pl-16px text-12px leading-5">
        <li v-for="(w, i) in warnings" :key="i">{{ w.message }}</li>
      </ul>
      <div class="mt-4px text-12px text-gray-500">
        这是系统基于当前 PB 10y 分位做的极端值粗粒度提示，档位（手填价格锚）和分位（统计位置）口径不同，
        最终是否需要调档由研究报告结论决定。
      </div>
    </NAlert>

    <NDivider />

    <div class="mb-8px text-12px text-gray-400">
      到档情景默认折叠；展开后才计算（五档 × 双时点 × 全持仓），保存或删除档位后若已展开会自动重算。
    </div>
    <NCollapse v-model:expanded-names="scenarioExpanded">
      <NCollapseItem title="到档情景 · 五档持仓盈亏 / 保证金 / 风险指标" name="scenario">
        <LevelScenarioTab
          v-if="scenarioExpanded.includes('scenario')"
          ref="scenarioRef"
          :um-id="umId"
          :symbol="symbol"
        />
      </NCollapseItem>
    </NCollapse>

    <!-- 档位录入抽屉（左侧），与逻辑 / 证伪 / 剧本 / 复盘抽屉同规格 -->
    <NDrawer v-model:show="showDrawer" placement="left" width="520px" :mask-closable="false">
      <NDrawerContent
        :title="editingDate ? `编辑 ${editingDate} 这一版档位` : '新增一版档位'"
        closable
        :native-scrollbar="false"
      >
        <NForm label-placement="left" label-width="90px" :show-feedback="false">
          <NFormItem label="生效日">
            <NDatePicker
              v-model:formatted-value="form.effective_date"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              :disabled="editingDate !== null"
              class="w-full"
            />
          </NFormItem>
          <NFormItem label="极低">
            <NInputNumber v-model:value="form.pp_el" :precision="4" :step="0.0001" class="w-full" />
          </NFormItem>
          <NFormItem label="低">
            <NInputNumber v-model:value="form.pp_l" :precision="4" :step="0.0001" class="w-full" />
          </NFormItem>
          <NFormItem label="中">
            <NInputNumber v-model:value="form.pp_m" :precision="4" :step="0.0001" disabled class="w-full" />
          </NFormItem>
          <NFormItem label="高">
            <NInputNumber v-model:value="form.pp_h" :precision="4" :step="0.0001" class="w-full" />
          </NFormItem>
          <NFormItem label="极高">
            <NInputNumber v-model:value="form.pp_eh" :precision="4" :step="0.0001" class="w-full" />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="form.note" placeholder="为什么调：如 三季报后下调中枢" />
          </NFormItem>
        </NForm>
        <div class="mt-8px text-12px" :class="hitVersion ? 'text-orange-500' : 'text-gray-400'">{{ dateHint }}</div>

        <template #footer>
          <NSpace justify="end">
            <NButton @click="showDrawer = false">取消</NButton>
            <NButton :loading="saving" :disabled="!canSave" @click="doSave()">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
