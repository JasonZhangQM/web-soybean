<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { fetchEconomicIndicators, syncEconomicIndicatorWscn } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { forwardFill } from './modules/utils';
import { useThemeStore } from '@/store/modules/theme';
import OverviewTab from './modules/overview/OverviewTab.vue';
import InflationTab from './modules/inflation/InflationTab.vue';
import EmploymentTab from './modules/employment/EmploymentTab.vue';
import ConsumptionTab from './modules/consumption/ConsumptionTab.vue';
import ManufacturingTab from './modules/manufacturing/ManufacturingTab.vue';
import EnergyTab from './modules/energy/EnergyTab.vue';
import RegionalTab from './modules/regional/RegionalTab.vue';
import GrowthTab from './modules/growth/GrowthTab.vue';
import PolicyTab from './modules/policy/PolicyTab.vue';
import YieldsTab from './modules/yields/YieldsTab.vue';

defineOptions({ name: 'UsEconomicDashboardPage' });

const themeStore = useThemeStore();
const loading = ref(false);
const wscnSyncLoading = ref(false);

// 数据容器：宏观指标数据 Map（indicator_code -> 升序时序数组）
const dataMap = ref<Map<string, Api.Bds.EconomicIndicator[]>>(new Map());

// Tab 当前激活项（默认 overview）
const activeTab = ref('overview');

// 已渲染 Tab 集合：切换 Tab 首次渲染，刷新/同步/日期变更后清空强制重渲染
const renderedTabs = ref<Set<string>>(new Set());

// 日期范围（YYYY-MM-DD 格式字符串元组），默认近三年
const dateRange = ref<[string, string] | null>(null);

// 看板所需全部美国宏观指标代码（按 9 大类分组）
const DASHBOARD_INDICATORS = {
  // 通胀 (11)
  inflation: ['CPI_YOY', 'CPI_MOM', 'CORE_CPI_YOY', 'CORE_CPI_MOM', 'PCE_YOY', 'PCE_MOM', 'CORE_PCE_YOY', 'CORE_PCE_MOM', 'PPI_YOY', 'MICHIGAN_5Y_INFLATION_EXPECTATION', 'MICHIGAN_1Y_INFLATION_EXPECTATION'],
  // 就业 (5)
  employment: ['NONFARM_PAYROLL', 'ADP_EMPLOYMENT_CHANGE', 'UNEMPLOYMENT_RATE', 'JOLTS_JOB_OPENINGS', 'INITIAL_JOBLESS_CLAIMS'],
  // 消费与投资 (4)
  consumption: ['RETAIL_SALES_MOM', 'DURABLE_GOODS_ORDERS_MOM', 'EXISTING_HOME_SALES', 'CONSUMER_CONFIDENCE'],
  // 制造业调查 (4)
  manufacturing: ['ISM_MFG_PMI', 'SP_GLOBAL_MFG_PMI', 'ISM_NON_MFG_PMI', 'SP_GLOBAL_SVC_PMI'],
  // 能源 (2)
  energy: ['EIA_CRUDE_OIL_INVENTORY_CHANGE', 'EIA_GASOLINE_INVENTORY_CHANGE'],
  // 地区联储 (2)
  regional: ['NY_FED_MFG_INDEX', 'RICHMOND_FED_MFG_INDEX'],
  // GDP与增长 (2)
  growth: ['GDP_QOQ', 'GOVERNMENT_BUDGET'],
  // 货币政策 (2)
  policy: ['FED_FUNDS_RATE', 'FED_FUNDS_RATE_UPPER'],
  // 收益率 (3)
  yields: ['YIELD_2Y', 'YIELD_10Y', 'YIELD_SPREAD_2Y10Y']
} as const;

// 扁平化全部所需指标代码（去重）
const ALL_CODES = Array.from(new Set(Object.values(DASHBOARD_INDICATORS).flat()));

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
        <NTabPane name="inflation" tab="通胀 (11)">
          <InflationTab v-if="shouldRender('inflation')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="employment" tab="就业 (5)">
          <EmploymentTab v-if="shouldRender('employment')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="consumption" tab="消费与投资 (4)">
          <ConsumptionTab v-if="shouldRender('consumption')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="manufacturing" tab="制造业调查 (4)">
          <ManufacturingTab v-if="shouldRender('manufacturing')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="energy" tab="能源 (2)">
          <EnergyTab v-if="shouldRender('energy')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="regional" tab="地区联储 (2)">
          <RegionalTab v-if="shouldRender('regional')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="growth" tab="GDP与增长 (2)">
          <GrowthTab v-if="shouldRender('growth')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="policy" tab="货币政策 (2)">
          <PolicyTab v-if="shouldRender('policy')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="yields" tab="收益率 (3)">
          <YieldsTab v-if="shouldRender('yields')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
