<script setup lang="ts">
/**
 * 标的档案抽屉（2026-10-30 架构升级）
 *
 * 开抽屉时只拉「概览最小集」detail（瘦身版），各 Tab 数据切到时懒加载。
 * 每个 Tab 完全自治：写操作后只刷自己那份数据，不再 emit('refresh') 级联。
 * 列表刷新（fetchData）统一在抽屉关闭时触发一次。
 *
 * ⚠️ 关联键一律用 `symbol`：主表 `id` 会漂移（历史上删过约 47 次，AUTO_INCREMENT 已到 56
 * 而只有 8 行），拿 id 做跨表引用迟早指错行。
 */
import { ref, computed, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { fetchValueMonitorDetail, type ValueMonitorDetail } from '@/service/api';
import OverviewTab from './OverviewTab.vue';
import ResearchVersionPanel from './ResearchVersionPanel.vue';
import ReviewTab from './ReviewTab.vue';
import VersionTab from './VersionTab.vue';
import LogicTab from './LogicTab.vue';
import PlanTab from './PlanTab.vue';

defineOptions({ name: 'VmDetailDrawer' });

const props = defineProps<{
  show: boolean;
  /** 列表行；只用于首屏骨架，真实数据以 detail 为准 */
  row: Api.Irs.ValueMonitor | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'edit', row: Api.Irs.ValueMonitor): void;
  /** 抽屉关闭时通知父组件刷列表（可能主题/zone/结论等列表字段变了） */
  (e: 'changed'): void;
}>();

const loading = ref(false);
const detail = ref<ValueMonitorDetail | null>(null);
const tab = ref('overview');
/** 抽屉打开期间有无任何写操作 — 决定关闭时要不要 emit('changed') */
let dirty = false;

const visible = computed({
  get: () => props.show,
  set: v => emit('update:show', v)
});

const vm = computed(() => detail.value?.vm ?? props.row);

const title = computed(() => {
  const v = vm.value;
  if (!v) return '标的档案';
  return `${v.symbol} ${v.name ?? ''}`.trim();
});

/** 头部标签：主题 / 类型 / 最新研究结论 / 复核到期 */
const headerTags = computed(() => {
  const v = vm.value;
  if (!v) return [];
  const tags: Array<{ text: string; type: 'default' | 'info' | 'warning' | 'error' | 'success' }> = [];
  if (v.theme) tags.push({ text: v.theme, type: 'info' });
  // 档位带（P0-1）+ 当前档位对应的 PE/PB 分位（P0-4 纠偏，仅指数标的有值）
  if (v.zone) tags.push({ text: v.zone, type: 'info' });
  if (v.pe_pct != null || v.pb_pct != null) {
    const pe = v.pe_pct != null ? Number(v.pe_pct).toFixed(1) : '—';
    const pb = v.pb_pct != null ? Number(v.pb_pct).toFixed(1) : '—';
    tags.push({ text: `PE 分位 ${pe}% / PB 分位 ${pb}%`, type: 'warning' });
  }
  const latest = detail.value?.latest_research;
  if (latest?.conclusion) tags.push({ text: latest.conclusion, type: 'success' });
  else tags.push({ text: '未做研究', type: 'warning' });
  if (latest?.next_review && latest.next_review < new Date().toISOString().slice(0, 10)) {
    tags.push({ text: `复核到期 ${latest.next_review}`, type: 'error' });
  }
  return tags;
});

async function load() {
  if (!props.row) return;
  loading.value = true;
  try {
    const { data, error } = await fetchValueMonitorDetail(props.row.id);
    if (!error && data) detail.value = data;
  } finally {
    loading.value = false;
  }
}

/** 子 Tab 写操作后标记 dirty，抽屉关闭时统一 emit('changed') 刷列表 */
function markDirty() {
  dirty = true;
}

watch(
  () => [props.show, props.row?.id] as const,
  ([show]) => {
    if (show) {
      // 换标的时回到概览，避免停在上一个标的的档位 Tab 上误改
      tab.value = 'overview';
      dirty = false;
      load();
    } else {
      // 抽屉关闭：有写操作才刷列表（1 次列表查询可接受）
      if (dirty) {
        emit('changed');
        dirty = false;
      }
    }
  },
  { immediate: true }
);

function goTab(name: string) {
  tab.value = name;
}
</script>

<template>
  <!--
    宽度用百分比：档位/计划/成交三个表加起来最宽 1210px，固定 1080 会把列挤到换行；
    66% 在 1920 屏上约 1267px，宽屏刚好不滚、窄屏走横向滚动。
  -->
  <!-- 只能点右上角关闭按钮退出：ESC 与点遮罩都不关闭（抽屉内有表单，误退会丢输入） -->
  <NDrawer v-model:show="visible" width="66%" placement="right" :mask-closable="false" :close-on-esc="false">
    <NDrawerContent :title="title" closable :native-scrollbar="false">
      <template #header>
        <div class="flex flex-wrap items-center gap-8px">
          <span class="font-500">{{ title }}</span>
          <NTag v-for="t in headerTags" :key="t.text" size="small" :bordered="false" :type="t.type">
            {{ t.text }}
          </NTag>
          <NButton v-if="row" size="tiny" text class="ml-8px" @click="emit('edit', row)">编辑标的信息</NButton>
        </div>
      </template>

      <NSpin :show="loading">
        <div v-if="!detail" class="py-40px text-center text-gray-400">载入中…</div>
        <!--
          去掉 animated（动画 + v-if 冲突）。
          用 lazy 让每个 Tab 只在**第一次切到时** mount — 触发 onMounted 懒加载接口。
          之后再切回来组件不销毁，数据保留在子组件的 ref 里，直接展示。
        -->
        <NTabs v-else v-model:value="tab" type="line">
          <!-- 概览：首屏直接渲染，跟 detail 接口一起秒开 -->
          <NTabPane name="overview" tab="概览" display-directive="show">
            <OverviewTab :detail="detail" @goto="goTab" />
          </NTabPane>
          <!-- 其他 Tab：show:lazy = 第一次激活才 mount，之后保持挂载（v-show），切回零等待 -->
          <NTabPane name="research" tab="研究" display-directive="show:lazy">
            <ResearchVersionPanel
              :vm-id="detail.vm.id"
              :symbol="detail.vm.symbol"
              :logic-count="detail.logic_total_count"
              :invalidate-count="detail.invalidate_total_count"
              @dirty="markDirty"
              @goto="goTab"
            />
          </NTabPane>
          <NTabPane name="review" tab="复盘" display-directive="show:lazy">
            <ReviewTab :vm-id="detail.vm.id" :symbol="detail.vm.symbol" @dirty="markDirty" />
          </NTabPane>
          <NTabPane name="version" tab="档位" display-directive="show:lazy">
            <VersionTab :vm-id="detail.vm.id" :symbol="detail.vm.symbol" @dirty="markDirty" />
          </NTabPane>
          <NTabPane name="logic" tab="逻辑与证伪" display-directive="show:lazy">
            <LogicTab :vm-id="detail.vm.id" :symbol="detail.vm.symbol" @dirty="markDirty" />
          </NTabPane>
          <NTabPane name="plan" tab="剧本与成交" display-directive="show:lazy">
            <PlanTab :vm-id="detail.vm.id" :symbol="detail.vm.symbol" @dirty="markDirty" />
          </NTabPane>
        </NTabs>
      </NSpin>

      <template #footer>
        <div class="text-12px text-gray-400">
          关联键用 symbol（id 会漂移）；主题只在本页维护；映射的编辑入口在合约页
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
