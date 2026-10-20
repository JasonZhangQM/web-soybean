<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { fetchIndexValuations, fetchIndexValuationPercentiles } from '@/service/api';
import { dateShortcuts } from '@/utils/date-shortcuts';
import PercentileCards from './modules/PercentileCards.vue';
import ValuationChart from './modules/ValuationChart.vue';
import ValuationTable from './modules/ValuationTable.vue';

defineOptions({ name: 'IrsIndexValuationPage' });

/**
 * 指数分位（IRs 决策区）
 *
 * 分工：本页只做**图表与判断**，原始数据表在 `/bds/index-valuation`。
 * 与「中国宏观」同构——`/irs/macro-framework` 是纯图表，`/bds/macro-research/economic-indicators` 是纯表。
 *
 * 数据源是 bds 的接口（`/api/v1/bds/index-*`），但不另建一层封装：
 * `macro-framework` 同样是直接 `import from '@/service/api/bds'`。
 *
 * ⚠️ 本页**不放写操作**（重算/同步）——那属于数据加工，留在 bds 页。
 * 决策区混入写操作，会让「看到的数」和「正在改的数」搅在一起。
 */

const route = useRoute();
const router = useRouter();
const message = useMessage();

const METRIC_OPTIONS = [
  { label: 'PE(TTM)', value: 'pe_ttm' },
  { label: 'PB(MRQ)', value: 'pb_mrq' },
  { label: '股息率(%)', value: 'dy_ttm' },
  { label: '中位PE', value: 'pe_median' }
];

function getDefaultStartDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}

/** 从 bds 页跳过来时可带上筛选的指数（`?index_codes=A,B`） */
function getInitialVisible(): string[] {
  const raw = route.query.index_codes;
  const str = Array.isArray(raw) ? raw[0] : raw;
  return str ? String(str).split(',').filter(Boolean) : [];
}

const metric = ref('pe_ttm');
const startDate = ref<string | null>(getDefaultStartDate());
const visible = ref<string[]>(getInitialVisible()); // 空 = 全部
const loading = ref(false);

const percentiles = ref<Api.Bds.IndexValuationPercentile[]>([]);
const seriesData = ref<Api.Bds.IndexValuationSeries | null>(null);

const metricLabel = computed(() => METRIC_OPTIONS.find(o => o.value === metric.value)?.label || '');

/** 指数勾选项：从分位接口的**全量**返回里生成（避免前端硬编码指数清单） */
const indexOptions = computed(() =>
  percentiles.value.map(i => ({ label: i.sec_name || i.index_code, value: i.index_code }))
);

const shownItems = computed(() =>
  visible.value.length ? percentiles.value.filter(i => visible.value.includes(i.index_code)) : percentiles.value
);

async function fetchData() {
  loading.value = true;
  try {
    const [pctRes, seriesRes] = await Promise.all([
      // 分位**不传** index_codes：这里要的是全景（同时作为下拉选项池），
      // 若按筛选传，取消勾选后选项池会跟着缩小、再也选不回来
      fetchIndexValuationPercentiles({ metric: metric.value }),
      // 曲线**传** index_codes：服务端筛选，少画几条线也少传几列
      fetchIndexValuations({
        start_date: startDate.value || undefined,
        metric: metric.value,
        index_codes: visible.value.length ? visible.value : undefined
      })
    ]);
    if (pctRes.error) {
      message.error((pctRes.error as any)?.message || '分位数据获取失败');
    } else {
      percentiles.value = pctRes.data?.items || [];
    }
    if (seriesRes.error) {
      message.error((seriesRes.error as any)?.message || '估值序列获取失败');
    } else {
      seriesData.value = seriesRes.data || null;
    }
  } finally {
    loading.value = false;
  }
}

/** 指标切换：指标变了，分位与曲线都得重算 */
function handleMetricChange() {
  fetchData();
}

/** 跳回 bds 原始数据页（该页自己有 page-state 记忆，会保留上次筛选） */
function goRawData() {
  router.push({ name: 'bds_index-valuation' });
}

onMounted(fetchData);
</script>

<template>
  <div class="p-16px">
    <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
      <NForm inline label-placement="left" :show-feedback="false" class="flex flex-wrap gap-12px">
        <NFormItem label="指标">
          <NRadioGroup v-model:value="metric" size="small" @update:value="handleMetricChange">
            <NRadioButton v-for="o in METRIC_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="起始日期">
          <NDatePicker
            v-model:formatted-value="startDate"
            type="date"
            value-format="yyyy-MM-dd"
            :shortcuts="dateShortcuts"
            clearable
            style="width: 150px"
            @update:formatted-value="fetchData"
          />
        </NFormItem>
        <NFormItem label="指数">
          <NSelect
            v-model:value="visible"
            multiple
            clearable
            filterable
            :options="indexOptions"
            placeholder="不选=全部"
            style="min-width: 260px"
            max-tag-count="responsive"
            @update:value="fetchData"
          />
        </NFormItem>
        <NFormItem class="ml-auto">
          <NSpace>
            <NButton :loading="loading" @click="fetchData">
              <template #icon><SvgIcon icon="mdi:refresh" /></template>
              刷新
            </NButton>
            <NButton type="info" ghost @click="goRawData">
              <template #icon><SvgIcon icon="mdi:table" /></template>
              原始数据
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>

      <div class="mt-8px text-12px" style="color: #999">
        分位与中位数由后端实时计算（窗口按自然日回溯：3/5/10 年），前端只做染色。 数据来源于 BDs
        →「指数估值」，本页不含任何写操作。
      </div>
    </NCard>

    <NCard :bordered="false" class="card-wrapper mb-16px" size="small" title="估值分位">
      <template #header-extra>
        <span class="text-12px op-60">默认看 10 年分位；&gt;80% 红（贵），&lt;20% 绿（便宜）</span>
      </template>
      <PercentileCards :items="shownItems" :metric-label="metricLabel" />
    </NCard>

    <NCard :bordered="false" class="card-wrapper mb-16px" size="small" :title="`${metricLabel} 估值曲线`">
      <ValuationChart
        v-if="seriesData"
        :dates="seriesData.trade_dates"
        :series="seriesData.series"
        :names="seriesData.sec_names"
        :visible="visible"
        :metric-label="metricLabel"
      />
      <NEmpty v-else description="暂无数据" class="py-24px" />
    </NCard>

    <NCard :bordered="false" class="card-wrapper" size="small" title="分位明细">
      <ValuationTable :items="shownItems" :metric-label="metricLabel" />
    </NCard>
  </div>
</template>
