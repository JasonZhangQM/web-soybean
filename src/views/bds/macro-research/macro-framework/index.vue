<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchEconomicIndicators, syncEconomicIndicatorWscn } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import { dateRangeShortcuts } from '@/utils/date-shortcuts';
import { forwardFill } from '../_shared/utils';
import ClockCard from './modules/ClockCard.vue';
import GrowthTab from './modules/growth/GrowthTab.vue';
import InflationTab from './modules/inflation/InflationTab.vue';
import FinancialTab from './modules/financial/FinancialTab.vue';
import PolicyTab from './modules/policy/PolicyTab.vue';
import ExternalTab from './modules/external/ExternalTab.vue';
import StructuralPanel from './modules/structural/StructuralPanel.vue';
import ExpectationPanel from './modules/expectation/ExpectationPanel.vue';

defineOptions({ name: 'MacroFrameworkPage' });

const loading = ref(false);
const wscnSyncLoading = ref(false);

// 数据容器：宏观指标数据 Map（indicator_code -> 升序时序数组）
const dataMap = ref<Map<string, Api.Bds.EconomicIndicator[]>>(new Map());

// Tab 当前激活项（默认 growth）
const activeTab = ref('growth');

// 已渲染 Tab 集合：切换 Tab 首次渲染，刷新/同步/日期变更后清空强制重渲染
const renderedTabs = ref<Set<string>>(new Set());

// 日期范围（YYYY-MM-DD 格式字符串元组），默认近三年
const dateRange = ref<[string, string] | null>(null);

// 六维宏观分析框架所需全部中国宏观指标代码（按 6 大维度分组）
const DASHBOARD_INDICATORS = {
  // 维度一：经济增长（7个指标）
  growth: ['CN_GDP_YOY', 'CN_INDUSTRIAL_VALUE_ADDED_YOY', 'CN_INDUSTRIAL_PROFIT_YOY', 'CN_RETAIL_SALES_YOY', 'CN_REAL_ESTATE_INVEST', 'CN_URBAN_FIXED_ASSET_INVEST_YOY', 'CN_URBAN_UNEMPLOYMENT'],
  // 维度二：通胀与就业（CPI/PPI + 失业率；失业率与growth共享，已在growth拉取）
  inflation: ['CN_CPI_YOY', 'CN_PPI_YOY'],
  // 维度三：金融条件（无数据，纯框架说明）
  financial: [],
  // 维度四：政策环境（6个指标，含LPR 1Y/5Y）
  policy: ['CN_SOCIAL_FINANCING_CUM', 'CN_NEW_RMB_LOANS_CUM', 'CN_M1_YOY', 'CN_M2_YOY', 'CN_LPR_1Y', 'CN_LPR_5Y'],
  // 维度六：外部环境（4个指标，贸易顺差从数据库直接获取）
  external: ['CN_EXPORT_YOY_USD', 'CN_IMPORT_YOY_USD', 'CN_TRADE_BALANCE_USD', 'CN_FX_RESERVES']
} as const;

// 扁平化全部所需指标代码（去重）
const ALL_CODES = Array.from(new Set(Object.values(DASHBOARD_INDICATORS).flat()));

// ===== 数据获取 =====

/** 并发拉取全部宏观指标（不做A股传导分析，无需上证指数） */
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
    renderedTabs.value.add('growth');
  });
});
</script>

<template>
  <div class="p-16px">
    <!-- 1. 顶部筛选区 -->
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

    <!-- 2. 周期定位 + 结构性底座（同一行，1:2 布局，窄屏堆叠） -->
    <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mb-16px">
      <NGi span="24 m:8">
        <ClockCard :data-map="dataMap" />
      </NGi>
      <NGi span="24 m:16">
        <StructuralPanel />
      </NGi>
    </NGrid>

    <!-- 3. 六维周期 Tab -->
    <NCard :bordered="false" class="card-wrapper mb-16px">
      <NTabs v-model:value="activeTab" type="line" animated @update:value="handleTabChange">
        <NTabPane name="growth" tab="① 增长">
          <GrowthTab v-if="shouldRender('growth')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="inflation" tab="② 通胀与就业">
          <InflationTab v-if="shouldRender('inflation')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="financial" tab="③ 金融条件">
          <FinancialTab v-if="shouldRender('financial')" :loading="loading" />
        </NTabPane>
        <NTabPane name="policy" tab="④ 政策">
          <PolicyTab v-if="shouldRender('policy')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="external" tab="⑤ 外部">
          <ExternalTab v-if="shouldRender('external')" :data-map="dataMap" :loading="loading" />
        </NTabPane>
        <NTabPane name="expectation" tab="预期与信心">
          <ExpectationPanel v-if="shouldRender('expectation')" />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
