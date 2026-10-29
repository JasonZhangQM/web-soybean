<script setup lang="ts">
/**
 * 标的档案抽屉（v3 §7.3）
 *
 * 一次 `GET /value-monitors/{id}/detail` 拿全：主表 + 当前档位 + 档位版本 + 研究版本 +
 * 计划 + 归属合约 + 成交 + 逻辑/证伪。各 Tab 内的写操作走各自端点，写完只刷 drawer 数据，
 * 不刷列表（列表由父组件在关闭时统一刷）。
 *
 * ⚠️ 关联键一律用 `symbol`：主表 `id` 会漂移（历史上删过约 47 次，AUTO_INCREMENT 已到 56
 * 而只有 8 行），拿 id 做跨表引用迟早指错行。
 */
import { ref, computed, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { fetchValueMonitorDetail, type ValueMonitorDetail } from '@/service/api';
import OverviewTab from './OverviewTab.vue';
import ResearchVersionPanel from './ResearchVersionPanel.vue';
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
  (e: 'changed'): void;
}>();

const loading = ref(false);
const detail = ref<ValueMonitorDetail | null>(null);
const tab = ref('overview');

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
    const pe = v.pe_pct != null ? (v.pe_pct * 100).toFixed(1) : '—';
    const pb = v.pb_pct != null ? (v.pb_pct * 100).toFixed(1) : '—';
    tags.push({ text: `PE 分位 ${pe}% / PB 分位 ${pb}%`, type: 'warning' });
  }
  const latest = detail.value?.research?.[0];
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

/** 子 Tab 写完后的统一刷新：只刷抽屉，不动列表 */
function refresh() {
  load();
  emit('changed');
}

watch(
  () => [props.show, props.row?.id] as const,
  ([show]) => {
    if (show) {
      // 换标的时回到概览，避免停在上一个标的的档位 Tab 上误改
      tab.value = 'overview';
      load();
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
  <NDrawer v-model:show="visible" width="66%" placement="right" :mask-closable="true">
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
        <NTabs v-else v-model:value="tab" type="line" animated>
          <NTabPane name="overview" tab="概览">
            <OverviewTab v-if="tab === 'overview'" :detail="detail" @goto="goTab" />
          </NTabPane>
          <NTabPane name="research" tab="研究">
            <ResearchVersionPanel
              v-if="tab === 'research'"
              :vm-id="detail.vm.id"
              :research="detail.research"
              :logic="detail.logic"
              :invalidate="detail.invalidate"
              @refresh="refresh"
              @goto="goTab"
            />
          </NTabPane>
          <NTabPane name="version" tab="档位">
            <VersionTab
              v-if="tab === 'version'"
              :vm-id="detail.vm.id"
              :symbol="detail.vm.symbol"
              :versions="detail.versions"
              @refresh="refresh"
            />
          </NTabPane>
          <NTabPane name="logic" tab="逻辑与证伪">
            <LogicTab
              v-if="tab === 'logic'"
              :vm-id="detail.vm.id"
              :logic="detail.logic"
              :invalidate="detail.invalidate"
              @refresh="refresh"
            />
          </NTabPane>
          <NTabPane name="plan" tab="计划与成交">
            <PlanTab
              v-if="tab === 'plan'"
              :vm-id="detail.vm.id"
              :plans="detail.plans"
              :trades="detail.trades"
              @refresh="refresh"
            />
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
