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
 * ⚠️ 本页**不放写操作**（重算/同步）——那属于数据加工，收口到「批量同步 → 指数估值重算」。
 * 决策区混入写操作，会让「看到的数」和「正在改的数」搅在一起。
 */

const route = useRoute();
const router = useRouter();
const message = useMessage();

const METRIC_OPTIONS = [
  { label: 'PE(TTM)', value: 'pe_ttm' },
  { label: 'PB(MRQ)', value: 'pb_mrq' },
  { label: '股息率(%)', value: 'dy_ttm' },
  { label: '中位PE', value: 'pe_median' },
  { label: 'PS(TTM)', value: 'ps_ttm' },
  // PCF 的口径与 PE 不同：只让正经营现金流的成分参与（分子分母同口径剔除），
  // 所以同一指数的 PCF 分位与 PE 分位代表的成分范围并不相同，故标签里带 * 并在页脚说明
  { label: 'PCF(TTM)*', value: 'pcf_ttm_oper' }
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

/**
 * 全页陈旧提示：只要有一个指数落后于个股估值源末日就提示。
 * 卡片底部虽已标「截至 X」，但小字容易被忽略 —— 陈旧时"当前值"不是最新值，
 * 直接拿它判贵贱会出错，必须在筛选条下方就说清。
 */
const staleInfo = computed(() => {
  const stale = percentiles.value.filter(i => i.is_stale);
  if (!stale.length) return null;
  const asOf = stale
    .map(i => i.as_of)
    .filter((d): d is string => !!d)
    .sort()[0];
  return {
    asOf,
    days: Math.max(...stale.map(i => i.stale_days || 0)),
    names: stale.map(i => i.sec_name || i.index_code).join('、')
  };
});

/** 全无数据：表刚建/刚清空时 5 张卡都是空的，得说清"不是坏了，是还没算" */
const hasNoData = computed(() => percentiles.value.length > 0 && percentiles.value.every(i => i.current == null));

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
            placeholder="全部"
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
        分位与中位数由后端实时计算（窗口按自然日回溯 3/5/10 年，锚点为各指数最后一个有值交易日），前端只做染色。
        数据来源于 BDs →「指数估值」，本页不含任何写操作（重算在「批量同步 → 指数估值重算」）。
      </div>
      <div v-if="metric === 'pcf_ttm_oper'" class="mt-6px text-12px" style="color: #ef9f27">
        <b>* PCF 口径与 PE 不同</b>
        ：只让正经营现金流的成分参与，分子分母同口径剔除（PE 则把亏损成分计入分母）。 故 PCF
        分位的成分范围比同指数其他指标小；负现金流占比越高，可比性越弱 —— 可在 BDs
        →「指数估值」的「负现金流数」列核对（实测沪深300 约 10%、科创50 约 28%）。
      </div>
      <NAlert v-if="staleInfo" type="warning" :bordered="false" class="mt-10px" :show-icon="true">
        估值数据截至 {{ staleInfo.asOf }}，落后最新个股数据 {{ staleInfo.days }} 天（{{ staleInfo.names }}） ——
        卡片上的「当前值」不是最新值，判断分位前需先重算估值。
      </NAlert>
      <NAlert v-else-if="hasNoData" type="info" :bordered="false" class="mt-10px" :show-icon="true">
        尚无估值数据（表为空）：需先到 BDs →「指数估值」执行重算/回填，本页才有分位可看。
      </NAlert>
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
