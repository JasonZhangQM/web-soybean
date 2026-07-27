<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchEconomicIndicators, syncEconomicIndicatorWscn, fetchDailyIndicators, syncDailyIndicator, syncAllDailyIndicators } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { forwardFill } from './modules/utils';
import { useThemeStore } from '@/store/modules/theme';
import { useBdsStore } from '@/store/modules/bds';
import OverviewTab from './modules/overview/OverviewTab.vue';
import InflationTab from './modules/inflation/InflationTab.vue';
import EmploymentTab from './modules/employment/EmploymentTab.vue';
import ExpectationTab from './modules/expectation/ExpectationTab.vue';
import EnergyTab from './modules/energy/EnergyTab.vue';
import GrowthTab from './modules/growth/GrowthTab.vue';
import FinancialTab from './modules/financial/FinancialTab.vue';

defineOptions({ name: 'UsEconomicDashboardPage' });

const themeStore = useThemeStore();
const bdsStore = useBdsStore();
const loading = ref(false);
const wscnSyncLoading = ref(false);

// 数据容器：宏观指标数据 Map（indicator_code -> 升序时序数组）
const dataMap = ref<Map<string, Api.Bds.EconomicIndicator[]>>(new Map());

// 收益率数据（DailyIndicator）容器与 loading，从 FinancialTab 上提至父组件统一管理
// 原因：同步功能迁移到顶部筛选区后，需在任意 Tab 下可用，而 FinancialTab 采用 v-if 懒加载
const yieldsDataMap = ref<Map<string, Api.Bds.DailyIndicator[]>>(new Map());
const yieldsLoading = ref(false);
// 收益率同步专用 loading：与单指标同步分离，避免按钮间互相影响
const yieldSyncLoading = ref(false);
const yieldAllSyncLoading = ref(false);
// 收益率单指标同步选中的代码（精确匹配）
const yieldSyncCode = ref<string | null>(null);

// Tab 当前激活项（默认 overview）
const activeTab = ref('overview');

// 已渲染 Tab 集合：切换 Tab 首次渲染，刷新/同步/日期变更后清空强制重渲染
const renderedTabs = ref<Set<string>>(new Set());

// 日期范围（YYYY-MM-DD 格式字符串元组），默认近三年
const dateRange = ref<[string, string] | null>(null);

// 看板所需全部美国宏观指标代码（按 6 大类分组，美债收益率指标由 FinancialTab 内部独立获取）
const DASHBOARD_INDICATORS = {
  // 通胀 (11)
  inflation: ['CPI_YOY', 'CPI_MOM', 'CORE_CPI_YOY', 'CORE_CPI_MOM', 'PCE_YOY', 'PCE_MOM', 'CORE_PCE_YOY', 'CORE_PCE_MOM', 'PPI_YOY', 'MICHIGAN_5Y_INFLATION_EXPECTATION', 'MICHIGAN_1Y_INFLATION_EXPECTATION'],
  // 就业 (5)
  employment: ['NONFARM_PAYROLL', 'ADP_EMPLOYMENT_CHANGE', 'UNEMPLOYMENT_RATE', 'JOLTS_JOB_OPENINGS', 'INITIAL_JOBLESS_CLAIMS'],
  // 预期 (6) —— 合并原 制造业调查 + 地区联储（景气调查类先行指标）
  expectation: ['ISM_MFG_PMI', 'SP_GLOBAL_MFG_PMI', 'ISM_NON_MFG_PMI', 'SP_GLOBAL_SVC_PMI', 'NY_FED_MFG_INDEX', 'RICHMOND_FED_MFG_INDEX'],
  // 能源 (2)
  energy: ['EIA_CRUDE_OIL_INVENTORY_CHANGE', 'EIA_GASOLINE_INVENTORY_CHANGE'],
  // 增长 (6) —— 合并原 GDP与增长 + 消费与投资
  growth: ['GDP_QOQ', 'GOVERNMENT_BUDGET', 'RETAIL_SALES_MOM', 'DURABLE_GOODS_ORDERS_MOM', 'EXISTING_HOME_SALES', 'CONSUMER_CONFIDENCE'],
  // 金融 (2) —— 合并原 货币政策（收益率指标由 FinancialTab 内部独立获取，不进入此分组）
  financial: ['FED_FUNDS_RATE', 'FED_FUNDS_RATE_UPPER']
} as const;

// 扁平化全部所需指标代码（去重）
const ALL_CODES = Array.from(new Set(Object.values(DASHBOARD_INDICATORS).flat()));

// 收益率看板所需的全部 4 个指标代码（DailyIndicator，独立于上面的 EconomicIndicator 分组）
const YIELD_CODES = ['YIELD_2Y', 'YIELD_10Y', 'YIELD_SPREAD_10Y2Y', 'YIELD_TIPS_10Y'] as const;
// 收益率指标下拉选项：computed 包装保证 store 异步加载后更新
const yieldIndicatorOptions = computed(() => bdsStore.getDailyIndicatorCodeOptions());

// ===== 数据获取 =====

/** 并发拉取全部宏观指标 */
async function fetchAllData() {
  loading.value = true;
  try {
    const [start_date, end_date] = dateRange.value || [];

    // 并发拉取所有宏观指标（Promise.allSettled 单指标失败不阻塞）
    const macroResults = await Promise.allSettled(
      ALL_CODES.map(code =>
        fetchEconomicIndicators({
          indicator_code: code,
          country: ['美国'],
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
  } finally {
    loading.value = false;
  }
}

/**
 * 拉取收益率指标数据（DailyIndicator）
 * 一次调用多选 IN 拉取 4 个指标，按 indicator_code 分组并按 report_date 升序排序
 * 从 FinancialTab 上提，供顶部筛选区同步功能与 FinancialTab 共用
 */
async function fetchAllYieldsData() {
  yieldsLoading.value = true;
  try {
    const [start_date, end_date] = dateRange.value || [];
    const { data, error } = await fetchDailyIndicators({
      indicator_code: [...YIELD_CODES],
      start_date: start_date || undefined,
      end_date: end_date || undefined,
      limit: 1000,
      offset: 0
    });
    if (error || !data) {
      yieldsDataMap.value = new Map();
      return;
    }
    // 按 indicator_code 分组
    const map = new Map<string, Api.Bds.DailyIndicator[]>();
    YIELD_CODES.forEach(code => map.set(code, []));
    data.items.forEach(item => {
      const list = map.get(item.indicator_code);
      if (list) list.push(item);
    });
    // 每组按 report_date 升序排序（接口默认 desc，需前端反转）
    map.forEach(list => list.sort((a, b) => a.report_date.localeCompare(b.report_date)));
    yieldsDataMap.value = map;
  } finally {
    yieldsLoading.value = false;
  }
}

// ===== 筛选区事件 =====

/** 日期范围变更：重新拉取经济指标与收益率数据并清空渲染状态 */
function handleDateChange() {
  renderedTabs.value = new Set();
  Promise.all([fetchAllData(), fetchAllYieldsData()]).then(() => {
    renderedTabs.value.add(activeTab.value);
  });
}

/** 刷新按钮：重新拉取经济指标与收益率数据并清空渲染状态 */
function handleRefresh() {
  renderedTabs.value = new Set();
  Promise.all([fetchAllData(), fetchAllYieldsData()]).then(() => {
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

/** 收益率单指标同步：选择指标后点击同步按钮触发后端 FRED 数据同步 */
function handleYieldSync() {
  if (!yieldSyncCode.value) {
    window.$message?.warning('请选择要同步的指标');
    return;
  }
  const code = yieldSyncCode.value;
  // 收益率同步后不清空 renderedTabs：yieldsDataMap 是 ref，更新后 Vue 自动触发 FinancialTab 重新渲染
  executeSync(() => syncDailyIndicator(code), yieldSyncLoading, fetchAllYieldsData);
}

/** 收益率全量同步：同步所有 4 个收益率指标 */
function handleYieldAllSync() {
  executeSync(() => syncAllDailyIndicators(), yieldAllSyncLoading, fetchAllYieldsData);
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
  // 加载收益率指标代码列表，供顶部同步下拉使用
  bdsStore.loadDailyIndicatorCodes();
  // 并发拉取经济指标与收益率数据
  Promise.all([fetchAllData(), fetchAllYieldsData()]).then(() => {
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
        <!-- 收益率同步区：单指标同步 + 全量同步（DailyIndicator，FRED 数据源） -->
        <NFormItem>
          <NSpace>
            <NSelect
              v-model:value="yieldSyncCode"
              :options="yieldIndicatorOptions"
              filterable
              clearable
              placeholder="选择收益率指标"
              style="width: 200px"
            />
            <NButton type="primary" :loading="yieldSyncLoading" @click="handleYieldSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              日频同步
            </NButton>
            <NButton type="primary" :loading="yieldAllSyncLoading" @click="handleYieldAllSync">
              <template #icon><SvgIcon icon="mdi:sync" /></template>
              日频全量同步
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
        <NTabPane name="inflation" tab="通胀">
          <InflationTab v-if="shouldRender('inflation')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="employment" tab="就业">
          <EmploymentTab v-if="shouldRender('employment')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="expectation" tab="预期">
          <ExpectationTab v-if="shouldRender('expectation')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="energy" tab="能源">
          <EnergyTab v-if="shouldRender('energy')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="growth" tab="增长">
          <GrowthTab v-if="shouldRender('growth')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <!-- 金融：合并原 货币政策（政策利率，父注入 EconomicIndicator）+ 美债收益（收益率，父注入 DailyIndicator） -->
        <NTabPane name="financial" tab="金融">
          <FinancialTab
            v-if="shouldRender('financial')"
            :data-map="dataMap"
            :loading="loading"
            :date-range="dateRange"
            :yields-data-map="yieldsDataMap"
            :yields-loading="yieldsLoading"
          />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
