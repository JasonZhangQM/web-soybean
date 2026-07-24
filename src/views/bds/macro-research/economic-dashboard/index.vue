<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchEconomicIndicators, fetchIndexHistories, syncEconomicIndicatorWscn } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { forwardFill } from './modules/utils';
import { useThemeStore } from '@/store/modules/theme';
import OverviewTab from './modules/overview/OverviewTab.vue';
import EarningsTab from './modules/earnings/EarningsTab.vue';
import LiquidityTab from './modules/liquidity/LiquidityTab.vue';
import SentimentTab from './modules/sentiment/SentimentTab.vue';
import ExternalTab from './modules/external/ExternalTab.vue';
import DemandTab from './modules/demand/DemandTab.vue';
import CorrelationTab from './modules/correlation/CorrelationTab.vue';

defineOptions({ name: 'EconomicDashboardPage' });

const themeStore = useThemeStore();
const loading = ref(false);
const wscnSyncLoading = ref(false);

// 数据容器：宏观指标数据 Map（indicator_code -> 升序时序数组）+ 上证指数时序
const dataMap = ref<Map<string, Api.Bds.EconomicIndicator[]>>(new Map());
const stockIndex = ref<Api.Bds.IndexHistory[]>([]);

// Tab 当前激活项（默认 overview）
const activeTab = ref('overview');

// 已渲染 Tab 集合：切换 Tab 首次渲染，刷新/同步/日期变更后清空强制重渲染
const renderedTabs = ref<Set<string>>(new Set());

// 日期范围（YYYY-MM-DD 格式字符串元组），默认近三年
const dateRange = ref<[string, string] | null>(null);

// 看板所需全部中国宏观指标代码（按 5 大类分组）
const DASHBOARD_INDICATORS = {
  // 盈利基本面
  earnings: ['CN_GDP_YOY', 'CN_INDUSTRIAL_VALUE_ADDED_YOY', 'CN_INDUSTRIAL_PROFIT_YOY', 'CN_CPI_YOY', 'CN_PPI_YOY'],
  // 流动性与信用
  liquidity: ['CN_SOCIAL_FINANCING_CUM', 'CN_NEW_RMB_LOANS_CUM', 'CN_M1_YOY', 'CN_M2_YOY', 'CN_LPR_1Y', 'CN_LPR_5Y'],
  // 景气预期
  sentiment: ['CN_OFFICIAL_MFG_PMI', 'CN_RATINGDOG_MFG_PMI', 'CN_OFFICIAL_NON_MFG_PMI', 'CN_RATINGDOG_SVC_PMI'],
  // 外贸与外部
  external: ['CN_EXPORT_YOY_USD', 'CN_IMPORT_YOY_USD', 'CN_TRADE_BALANCE_USD', 'CN_FX_RESERVES', 'CN_SWIFT_CNY_SHARE'],
  // 消费与投资
  demand: ['CN_RETAIL_SALES_YOY', 'CN_REAL_ESTATE_INVEST', 'CN_SWIFT_CNY_SHARE']
} as const;

// 扁平化全部所需指标代码（去重）
const ALL_CODES = Array.from(new Set(Object.values(DASHBOARD_INDICATORS).flat()));

// ===== 衍生值计算函数 =====

/** CPI-PPI 剪刀差：按 report_date 对齐，CPI 同比 - PPI 同比 */
function calcScissors(cpiArr: Api.Bds.EconomicIndicator[], ppiArr: Api.Bds.EconomicIndicator[]) {
  const ppiMap = new Map(ppiArr.map(x => [x.report_date, Number(x.value)]));
  return cpiArr
    .filter(x => ppiMap.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      value: Number(x.value) - (ppiMap.get(x.report_date) as number)
    }));
}

/** M1-M2 剪刀差：按 report_date 对齐，M1 同比 - M2 同比 */
function calcM1M2(m1Arr: Api.Bds.EconomicIndicator[], m2Arr: Api.Bds.EconomicIndicator[]) {
  const m2Map = new Map(m2Arr.map(x => [x.report_date, Number(x.value)]));
  return m1Arr
    .filter(x => m2Map.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      value: Number(x.value) - (m2Map.get(x.report_date) as number)
    }));
}

/** 贸易顺差（同比增速差）：出口同比 - 进口同比 */
function calcTradeBalance(expArr: Api.Bds.EconomicIndicator[], impArr: Api.Bds.EconomicIndicator[]) {
  const impMap = new Map(impArr.map(x => [x.report_date, Number(x.value)]));
  return expArr
    .filter(x => impMap.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      value: Number(x.value) - (impMap.get(x.report_date) as number)
    }));
}

/** min-max 标准化到 0-100 */
function normalize(arr: number[]): number[] {
  if (!arr.length) return [];
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  if (mn === mx) return arr.map(() => 50);
  return arr.map(v => +(((v - mn) / (mx - mn)) * 100).toFixed(1));
}

// ===== 数据获取 =====

/** 并发拉取全部宏观指标 + 上证指数 */
async function fetchAllData() {
  loading.value = true;
  try {
    const [start_date, end_date] = dateRange.value || [];

    // 并发拉取所有宏观指标（Promise.allSettled 单指标失败不阻塞）
    const macroResults = await Promise.allSettled(
      ALL_CODES.map(code =>
        fetchEconomicIndicators({
          indicator_code: code,
          country: ['中国'],
          start_date: start_date || undefined,
          end_date: end_date || undefined,
          limit: 1000,
          offset: 0
        }).then(({ data, error }) => {
          if (error || !data) return { code, list: [] as Api.Bds.EconomicIndicator[] };
          // 按 report_date 升序
          return { code, list: [...data.items].sort((a, b) => a.report_date.localeCompare(b.report_date)) };
        })
      )
    );

    const map = new Map<string, Api.Bds.EconomicIndicator[]>();
    macroResults.forEach(r => {
      if (r.status === 'fulfilled') {
        // 对时序数据做前向填充：value 为空的时点用前一个非空值补充
        map.set(r.value.code, forwardFill(r.value.list));
      }
    });
    dataMap.value = map;

    // 拉取上证指数（start_date 起全部，前端按 end_date 过滤）
    const { data: idxData, error: idxError } = await fetchIndexHistories({
      symbol: ['SHSE.000001'],
      start_date: start_date || undefined,
      limit: 10000,
      offset: 0
    });
    if (!idxError && idxData) {
      let list = [...idxData.items].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
      if (end_date) list = list.filter(x => x.trade_date <= end_date);
      stockIndex.value = list;
    } else {
      stockIndex.value = [];
    }
  } finally {
    loading.value = false;
  }
}

/** 从 dataMap 中取某指标最新一条记录 */
function getLatest(code: string): Api.Bds.EconomicIndicator | null {
  const list = dataMap.value.get(code);
  if (!list || !list.length) return null;
  return list[list.length - 1];
}

// ===== 筛选区事件 =====

/** 日期范围变更：重新拉取数据并清空渲染状态 */
function handleDateChange() {
  renderedTabs.value = new Set();
  fetchAllData().then(() => {
    renderedTabs.value.add(activeTab.value);
  });
}

/** 刷新按钮：重新拉取数据并清空渲染状态 */
function handleRefresh() {
  renderedTabs.value = new Set();
  fetchAllData().then(() => {
    renderedTabs.value.add(activeTab.value);
  });
}

/** wscn 同步：同步完成后重新拉取数据并清空渲染状态 */
function handleWscnSync() {
  executeSync(
    () => syncEconomicIndicatorWscn(),
    wscnSyncLoading,
    () => {
      renderedTabs.value = new Set();
      return fetchAllData().then(() => {
        renderedTabs.value.add(activeTab.value);
      });
    }
  );
}

/** Tab 切换：首次切换时标记为已渲染 */
function handleTabChange(tab: string) {
  activeTab.value = tab;
  renderedTabs.value.add(tab);
}

/** 判断某 Tab 是否应渲染（懒加载） */
function shouldRender(tab: string): boolean {
  return renderedTabs.value.has(tab);
}

// ===== 初始化默认日期范围（近三年） =====
function initDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  dateRange.value = [fmt(start), fmt(end)];
}

onMounted(() => {
  initDefaultDateRange();
  fetchAllData().then(() => {
    renderedTabs.value.add('overview');
  });
});
</script>

<template>
  <div class="p-16px">
    <!-- 顶部筛选区 -->
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" class="flex flex-wrap gap-12px items-center">
        <NFormItem label="日期范围">
          <NDatePicker
            v-model:formatted-value="dateRange"
            type="daterange"
            value-format="yyyy-MM-dd"
            :shortcuts="dateRangeShortcuts"
            clearable
            style="width: 320px"
            @update:formatted-value="handleDateChange"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" :loading="loading" @click="handleRefresh">
              <template #icon><SvgIcon icon="mdi:refresh" /></template>
              刷新
            </NButton>
            <NButton type="primary" :loading="wscnSyncLoading" @click="handleWscnSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              wscn同步
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>

    <!-- Tab 区 -->
    <NCard :bordered="false" class="card-wrapper">
      <NTabs v-model:value="activeTab" type="line" animated @update:value="handleTabChange">
        <NTabPane name="overview" tab="总览">
          <OverviewTab v-if="shouldRender('overview')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="earnings" tab="盈利基本面 (6)">
          <EarningsTab v-if="shouldRender('earnings')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="liquidity" tab="流动性与信用 (7)">
          <LiquidityTab v-if="shouldRender('liquidity')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="sentiment" tab="景气预期 (4)">
          <SentimentTab v-if="shouldRender('sentiment')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="external" tab="外贸与外部 (4)">
          <ExternalTab v-if="shouldRender('external')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="demand" tab="消费与投资 (3)">
          <DemandTab v-if="shouldRender('demand')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="correlation" tab="A股传导分析">
          <CorrelationTab v-if="shouldRender('correlation')" :data-map="dataMap" :stock-index="stockIndex" :loading="loading" />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
