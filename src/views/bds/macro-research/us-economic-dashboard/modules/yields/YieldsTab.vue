<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchYieldIndicators, syncYieldIndicator, syncAllYieldIndicators } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
// 跨目录复用中国看板 MetricCard：从 yields/ → modules/ → us-economic-dashboard/ → macro-research/ → economic-dashboard/modules/
import MetricCard from '../../../economic-dashboard/modules/MetricCard.vue';
import { getLatest } from './utils';
import YieldCompareChart from './YieldCompareChart.vue';
import SpreadChart from './SpreadChart.vue';
import YieldComboChart from './YieldComboChart.vue';
import YieldTipsChart from './YieldTipsChart.vue';

defineOptions({ name: 'YieldsTab' });

interface Props {
  /** 日期范围（YYYY-MM-DD 格式字符串元组），由父组件统一控制 */
  dateRange: [string, string] | null;
}
const props = defineProps<Props>();

const bdsStore = useBdsStore();
const loading = ref(false);
// 同步专用 loading：与图表 loading 分离，避免同步过程中图表闪烁
const syncLoading = ref(false);
// 全量同步 loading：与单指标同步分离，避免按钮间互相影响
const allSyncLoading = ref(false);

// 数据容器：收益率指标数据 Map（indicator_code -> 升序时序数组）
const dataMap = ref<Map<string, Api.Bds.YieldIndicator[]>>(new Map());

// 同步用单指标代码（精确匹配）
const syncIndicatorCode = ref<string | null>(null);

// 收益率看板所需的全部 4 个指标代码
const DASHBOARD_CODES = ['YIELD_2Y', 'YIELD_10Y', 'YIELD_SPREAD_2Y10Y', 'YIELD_TIPS_10Y'] as const;

// 指标代码下拉选项：computed 包装保证 store 异步加载后更新
const indicatorOptions = computed(() => bdsStore.getYieldIndicatorCodeOptions());

// ===== 各指标最新值（用于顶部卡片） =====
const y2Latest = computed(() => getLatest(dataMap.value, 'YIELD_2Y'));
const y10Latest = computed(() => getLatest(dataMap.value, 'YIELD_10Y'));
const spreadLatest = computed(() => getLatest(dataMap.value, 'YIELD_SPREAD_2Y10Y'));
const tipsLatest = computed(() => getLatest(dataMap.value, 'YIELD_TIPS_10Y'));

/**
 * 环比变化：当前 value - 前一条非 null 记录的 value
 * YieldIndicator 无 value_prev 字段，从 dataMap 中取前一条记录计算
 * 仅适用于日频收益率指标（2Y/10Y）
 */
function computeChangeFromPrev(code: string): number | null {
  const list = dataMap.value.get(code);
  if (!list || list.length < 2) return null;
  // 从尾部向前找最新一条非 null 记录
  let latestIdx = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].value != null) {
      latestIdx = i;
      break;
    }
  }
  if (latestIdx <= 0) return null;
  // 找上一条非 null 记录
  let prevIdx = -1;
  for (let i = latestIdx - 1; i >= 0; i--) {
    if (list[i].value != null) {
      prevIdx = i;
      break;
    }
  }
  if (prevIdx < 0) return null;
  return Number(list[latestIdx].value) - Number(list[prevIdx].value);
}

// 利差状态：倒挂（<0，红色）/ 正常（≥0，绿色）
const spreadStatus = computed(() => {
  if (!spreadLatest.value || spreadLatest.value.value == null) return null;
  const v = Number(spreadLatest.value.value);
  // 收益率曲线倒挂：2Y > 10Y，即 2Y-10Y 利差 < 0
  if (v < 0) return { desc: '倒挂', color: '#dc2626' };
  return { desc: '正常', color: '#16a34a' };
});

// ===== 数据获取 =====

/**
 * 一次调用多选 IN 拉取 4 个指标数据，减少 HTTP 请求数
 * 响应 items 按 indicator_code 分组后存入 dataMap，并按 report_date 升序排序（接口默认 desc）
 */
async function fetchAllData() {
  loading.value = true;
  try {
    const [start_date, end_date] = props.dateRange || [];
    const { data, error } = await fetchYieldIndicators({
      indicator_code: [...DASHBOARD_CODES],
      start_date: start_date || undefined,
      end_date: end_date || undefined,
      limit: 1000,
      offset: 0
    });
    if (error || !data) {
      dataMap.value = new Map();
      return;
    }
    // 按 indicator_code 分组
    const map = new Map<string, Api.Bds.YieldIndicator[]>();
    DASHBOARD_CODES.forEach(code => map.set(code, []));
    data.items.forEach(item => {
      const list = map.get(item.indicator_code);
      if (list) list.push(item);
    });
    // 每组按 report_date 升序排序（接口默认 desc，需前端反转）
    map.forEach(list => list.sort((a, b) => a.report_date.localeCompare(b.report_date)));
    dataMap.value = map;
  } finally {
    loading.value = false;
  }
}

/** 单指标同步：选择指标后点击同步按钮触发后端 FRED 数据同步 */
function handleSync() {
  if (!syncIndicatorCode.value) {
    window.$message?.warning('请选择要同步的指标');
    return;
  }
  const code = syncIndicatorCode.value;
  executeSync(
    () => syncYieldIndicator(code),
    syncLoading,
    fetchAllData
  );
}

/** 全量同步所有 4 个收益率指标 */
function handleAllSync() {
  executeSync(
    () => syncAllYieldIndicators(),
    allSyncLoading,
    fetchAllData
  );
}

// 父组件切换 Tab 时首次挂载触发数据拉取；父组件刷新/日期变更时清空 renderedTabs 触发卸载，
// 重新挂载时会再次进入 onMounted，实现"刷新"语义
onMounted(() => {
  fetchAllData();
  // 加载收益率指标代码列表，供同步下拉使用
  bdsStore.loadYieldIndicatorCodes();
});
</script>

<template>
  <div class="pb-12px">
    <!-- 同步区域：与美股看板其他 tab 风格一致，放在 tab 内容顶部右侧 -->
    <div class="flex justify-end mb-12px gap-12px">
      <NSpace>
        <NSelect
          v-model:value="syncIndicatorCode"
          :options="indicatorOptions"
          filterable
          clearable
          placeholder="选择指标"
          style="width: 200px"
        />
        <NButton type="primary" :loading="syncLoading" @click="handleSync">
          <template #icon><SvgIcon icon="mdi:sync" /></template>
          同步
        </NButton>
      </NSpace>
      <NButton type="primary" :loading="allSyncLoading" @click="handleAllSync">
        <template #icon><SvgIcon icon="mdi:sync" /></template>
        全量同步
      </NButton>
    </div>

    <NSpin :show="loading">
      <!-- 第 1 行：4 张指标卡片（2Y / 10Y / 2Y-10Y利差 / 10Y TIPS） -->
      <NGrid cols="24" responsive="screen" item-responsive :x-gap="12" :y-gap="12" class="mb-16px">
        <NGi span="6 s:12 m:6 l:6">
          <MetricCard
            label="2年期美债收益率"
            :value="y2Latest?.value ?? null"
            unit="%"
            :date="y2Latest?.report_date"
            :change="computeChangeFromPrev('YIELD_2Y')"
          />
        </NGi>
        <NGi span="6 s:12 m:6 l:6">
          <MetricCard
            label="10年期美债收益率"
            :value="y10Latest?.value ?? null"
            unit="%"
            :date="y10Latest?.report_date"
            :change="computeChangeFromPrev('YIELD_10Y')"
          />
        </NGi>
        <NGi span="6 s:12 m:6 l:6">
          <MetricCard
            label="2Y-10Y利差"
            :value="spreadLatest?.value ?? null"
            unit="%"
            :date="spreadLatest?.report_date"
            :desc="spreadStatus?.desc"
            :color="spreadStatus?.color"
          />
        </NGi>
        <NGi span="6 s:12 m:6 l:6">
          <MetricCard
            label="10年期TIPS"
            :value="tipsLatest?.value ?? null"
            unit="%"
            :date="tipsLatest?.report_date"
          />
        </NGi>
      </NGrid>

      <!-- 第 2 行：4 张图表，前 2 张各占 1 列，后 2 张综合图各跨双列 -->
      <NGrid cols="24" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">2年期 vs 10年期美债收益率</div>
            <div class="chart-box__sub">2Y（蓝）与 10Y（红）日频收益率双折线对比，以 10Y 日期为主轴对齐 2Y</div>
            <YieldCompareChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24 s:24 m:12">
          <div class="chart-box">
            <div class="chart-box__title">2Y-10Y 利差</div>
            <div class="chart-box__sub">2Y-10Y 利差柱状图，正值蓝柱、负值红柱，含 0 倒挂线（虚线灰色）</div>
            <SpreadChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">2Y + 10Y 收益率 vs 2Y-10Y 利差</div>
            <div class="chart-box__sub">双轴综合视图：左轴 2Y/10Y 收益率折线，右轴 2Y-10Y 利差柱状（按正负着色）</div>
            <YieldComboChart :data-map="dataMap" />
          </div>
        </NGi>
        <NGi span="24">
          <div class="chart-box">
            <div class="chart-box__title">10年期名义收益率 vs 10年期TIPS</div>
            <div class="chart-box__sub">双折线对比：名义蓝（#2563eb）、TIPS 橙（#ea580c）；两线差距 = 盈亏平衡通胀率，可观察市场对未来 10 年平均通胀预期</div>
            <YieldTipsChart :data-map="dataMap" />
          </div>
        </NGi>
      </NGrid>
    </NSpin>
  </div>
</template>

<style scoped>
.chart-box {
  background: var(--bg2, #fff);
  border: 1px solid var(--rule, #d1d5db);
  border-radius: 8px;
  padding: 16px;
}

.chart-box__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
  margin-bottom: 4px;
}

.chart-box__sub {
  font-size: 11px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
}
</style>
