<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { useEcharts } from '@/hooks/common/echarts';
import { fetchIndexCumReturns, syncIndexHistory } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';
import { dateShortcuts } from '@/utils/date-shortcuts';

defineOptions({
  name: 'IndexCumReturnChart'
});

const appStore = useAppStore();
const themeStore = useThemeStore();

// ===== 指数配置：从后端 INDEX_CODE 字典镜像同步（固定，运行时不变） =====
// key = symbol，value = sec_name；顺序影响下拉展示顺序和默认选中
const INDEX_OPTIONS = [
  { value: 'SHSE.000001', label: '上证指数' },
  { value: 'SHSE.000300', label: '沪深300' },
  { value: 'SHSE.000510', label: '中证A500' },
  { value: 'SHSE.000905', label: '中证500' },
  { value: 'SHSE.000852', label: '中证1000' },
  { value: 'SHSE.000688', label: '科创50' },
  { value: 'SZSE.399006', label: '创业板指' },
  { value: 'SP500', label: 'S&P 500' }
];

// localStorage key
const LS_KEY = 'home.index_visible';

// 默认选中：传统 5 只主力指数，新增的 A500/1000/科创50 默认不选
const DEFAULT_VISIBLE = ['SHSE.000001', 'SHSE.000300', 'SHSE.000905', 'SZSE.399006', 'SP500'];

// ===== 用户可见 symbol 列表：localStorage 优先，缺省 DEFAULT_VISIBLE =====
function loadVisible(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // 过滤掉已不在 INDEX_OPTIONS 的脏值
        const valid = INDEX_OPTIONS.filter(o => arr.includes(o.value)).map(o => o.value);
        if (valid.length) return valid;
      }
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_VISIBLE];
}
const visibleSymbols = ref<string[]>(loadVisible());

// 切换选择后立刻持久化
watch(
  visibleSymbols,
  val => {
    localStorage.setItem(LS_KEY, JSON.stringify(val));
  },
  { deep: true }
);

// sec_name → symbol 映射（后端 series 以 sec_name 作为 key，需反查 symbol 取色）
const NAME_TO_SYMBOL: Record<string, string> = Object.fromEntries(INDEX_OPTIONS.map(o => [o.label, o.value]));

// ===== 起始日期 =====
function getDefaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}
const startDate = ref<string | null>(getDefaultStartDate());

// 多色配色：按全部 8 只的固定顺序取色，避免增减 visibleSymbols 时颜色跳变
const ALL_COLORS = ['#5da8ff', '#26deca', '#fedc69', '#ff7d85', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'];
// 每个 symbol 绑定固定颜色
const SYMBOL_COLOR: Record<string, string> = Object.fromEntries(
  INDEX_OPTIONS.map((o, i) => [o.value, ALL_COLORS[i % ALL_COLORS.length]])
);
// 最新数据行：每个指数的最新累计收益率 / 当前最大回撤 / 历史最大回撤
interface LatestRow {
  symbol: string;
  name: string;
  color: string;
  cumReturn: number | null;
  drawdown: number | null;
  maxDrawdown: number | null;
  date: string;
}
const latestRows = ref<LatestRow[]>([]);

// 表格容器样式：根据暗色模式切换半透明背景与文字色
const tableStyle = computed(() => {
  const dark = themeStore.darkMode;
  return {
    background: dark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(255, 255, 255, 0.3)',
    color: dark ? '#e5e7eb' : '#1f2937',
    borderColor: dark ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.7)'
  };
});

// 数值格式化：null/undefined 显示 '-'，否则保留 2 位小数
function fmt(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '-' : v.toFixed(2);
}

const { domRef, updateOptions } = useEcharts(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      label: {
        backgroundColor: '#6a7985'
      }
    },
    // 自定义 tooltip：每个指数一行，累计收益率后括号内显示回撤
    formatter: (params: any) => {
      let html = params[0].axisValue;
      const cumParams = params.filter((p: any) => !p.seriesName.endsWith('-回撤'));
      cumParams.forEach((p: any) => {
        const ddParam = params.find((dp: any) => dp.seriesName === `${p.seriesName}-回撤`);
        const cumVal = p.value != null ? Number(p.value).toFixed(2) : '-';
        const ddVal = ddParam && ddParam.value != null ? Number(ddParam.value).toFixed(2) : '-';
        html += `<br/>${p.marker}${p.seriesName}: ${cumVal} (${ddVal})`;
      });
      return html;
    }
  },
  legend: {
    data: [] as string[],
    bottom: '2%',
    left: 'center',
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 12 }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '12%',
    top: '18%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: [] as string[]
  },
  yAxis: [
    {
      type: 'value',
      name: '累计收益率(%)',
      splitNumber: 5,
      min: 0,
      max: 0
    },
    {
      type: 'value',
      name: '最大回撤(%)',
      max: 0,
      min: 0,
      splitNumber: 5,
      splitLine: { show: false }
    }
  ],
  series: [] as never[]
}));

// 拉取指数累计收益率，按 visibleSymbols 过滤后端数据后动态构造 series
async function initData() {
  if (visibleSymbols.value.length === 0) {
    // 全部取消选择时，清空图表不请求后端
    updateOptions(opts => {
      opts.legend.data = [];
      opts.xAxis.data = [];
      opts.series = [] as never;
      return opts;
    });
    latestRows.value = [];
    return;
  }

  const { data, error } = await fetchIndexCumReturns({
    start_date: startDate.value || undefined,
    symbols: visibleSymbols.value
  });
  if (error || !data || !data.trade_dates || data.trade_dates.length === 0) return;

  const seriesNames = Object.keys(data.series);
  // 累计收益率折线：name 用 sec_name（后端已映射），颜色查 SYMBOL_COLOR
  const cumSeries = seriesNames.map(name => {
    const symbol = NAME_TO_SYMBOL[name];
    return {
      color: SYMBOL_COLOR[symbol] ?? '#5da8ff',
      name,
      type: 'line' as const,
      smooth: true,
      yAxisIndex: 0,
      data: data.series[name]
    };
  });
  // 最大回撤折线（仅面积填充）：用右 Y 轴，与累计收益率同色
  const drawdownSeries = seriesNames.map(name => {
    const symbol = NAME_TO_SYMBOL[name];
    return {
      color: SYMBOL_COLOR[symbol] ?? '#5da8ff',
      name: `${name}-回撤`,
      type: 'line' as const,
      smooth: true,
      yAxisIndex: 1,
      lineStyle: { opacity: 0 },
      symbol: 'none' as const,
      areaStyle: { opacity: 0.2 },
      data: data.max_drawdown[name]
    };
  });

  const chartSeries = [...cumSeries, ...drawdownSeries];
  const allNames = [...seriesNames];

  updateOptions(opts => {
    opts.legend.data = allNames;
    opts.xAxis.data = data.trade_dates;
    opts.series = chartSeries as never;

    // 动态计算左轴（累计收益率）范围
    const allCumReturns = seriesNames.flatMap(n => data.series[n] ?? []);
    const cumMax = Math.max(0, ...allCumReturns.filter((v): v is number => v !== null));
    const cumMin = Math.min(0, ...allCumReturns.filter((v): v is number => v !== null));
    const leftMin = Math.floor(cumMin / 10) * 10;
    const leftMax = Math.ceil(cumMax / 10) * 10;
    const rightMin = -(leftMax - leftMin);

    opts.yAxis[0].min = leftMin;
    opts.yAxis[0].max = leftMax;
    opts.yAxis[1].min = rightMin;

    return opts;
  });

  // 计算每个指数的最新累计收益率 / 当前回撤 / 历史最大回撤
  const lastIdx = data.trade_dates.length - 1;
  const rows: LatestRow[] = seriesNames.map(name => {
    const symbol = NAME_TO_SYMBOL[name];
    const cumArr = data.series[name] ?? [];
    const ddArr = data.max_drawdown[name] ?? [];
    let cumVal: number | null = null;
    let cumDate = '';
    for (let i = cumArr.length - 1; i >= 0; i--) {
      if (cumArr[i] != null && Number.isFinite(cumArr[i] as number)) {
        cumVal = cumArr[i] as number;
        cumDate = data.trade_dates[i] ?? '';
        break;
      }
    }
    let ddVal: number | null = null;
    for (let i = ddArr.length - 1; i >= 0; i--) {
      if (ddArr[i] != null && Number.isFinite(ddArr[i] as number)) {
        ddVal = ddArr[i] as number;
        break;
      }
    }
    const ddValid = ddArr.filter((v): v is number => v != null && Number.isFinite(v));
    const maxDdVal = ddValid.length ? Math.min(...ddValid) : null;
    return {
      symbol,
      name,
      color: SYMBOL_COLOR[symbol] ?? '#5da8ff',
      cumReturn: cumVal,
      drawdown: ddVal,
      maxDrawdown: maxDdVal,
      date: cumDate || (lastIdx >= 0 ? data.trade_dates[lastIdx] : '')
    };
  });
  latestRows.value = rows;
}

// 同步专用 loading：控制同步图标旋转动画
const syncLoading = ref(false);

// 触发指数历史行情同步（与 bds/market-data/index-histories 页面同步按钮调用相同接口）
async function handleSync() {
  await executeSync(syncIndexHistory, syncLoading, initData);
}

// 语言切换时刷新
function updateLocale() {
  updateOptions((opts, factory) => {
    const originOpts = factory();
    opts.legend.data = originOpts.legend.data;
    opts.xAxis.data = originOpts.xAxis.data;
    opts.series = originOpts.series;
    return opts;
  });
}

async function init() {
  await initData();
}

// 日期选择器变动 → 重新拉数据
function handleDateChange() {
  init();
}

// visibleSymbols 变动 → 重新拉数据（前后端双重过滤）
watch(visibleSymbols, () => {
  initData();
});

watch(
  () => appStore.locale,
  () => {
    updateLocale();
  }
);

// init
init();
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div class="relative h-520px overflow-hidden">
      <!-- 左上控制区：起始日期 + 指数多选 + 同步按钮（同一行） -->
      <div class="absolute top-0 flex items-center z-10 gap-8px" style="left: 3%; right: 3%">
        <span class="text-14px text-color-2">起始</span>
        <NDatePicker
          v-model:formatted-value="startDate"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          placeholder="默认近10年"
          :shortcuts="dateShortcuts"
          :style="{ width: '140px', flexShrink: 0 }"
          @update:formatted-value="handleDateChange"
        />
        <span
          class="inline-flex cursor-pointer opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
          :class="[syncLoading ? 'animate-spin' : '']"
          @click="handleSync"
        >
          <SvgIcon icon="mdi:sync" class="text-16px" />
        </span>
        <span class="text-13px text-color-2 ml-4px flex-shrink-0">指数</span>
        <NCheckboxGroup v-model:value="visibleSymbols" style="flex: 1; min-width: 0">
          <NSpace :size="10" :wrap="true">
            <NCheckbox v-for="opt in INDEX_OPTIONS" :key="opt.value" :value="opt.value" size="small">
              {{ opt.label }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
      </div>
      <!-- echarts 容器 -->
      <div ref="domRef" class="h-520px"></div>
      <!-- 最新数据表格 -->
      <div v-if="latestRows.length" class="latest-table" :style="tableStyle">
        <table>
          <thead>
            <tr>
              <th class="th-name">指数</th>
              <th class="th-num">累计收益率(%)</th>
              <th class="th-num">当前回撤(%)</th>
              <th class="th-num">历史最大回撤(%)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in latestRows" :key="row.symbol">
              <td class="td-name">
                <span class="color-dot" :style="{ background: row.color }"></span>
                <span>{{ row.name }}</span>
              </td>
              <td class="td-num">{{ fmt(row.cumReturn) }}</td>
              <td class="td-num">{{ fmt(row.drawdown) }}</td>
              <td class="td-num">{{ fmt(row.maxDrawdown) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="latestRows[0]?.date" class="latest-date">截至 {{ latestRows[0].date }}</div>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.latest-table {
  position: absolute;
  top: 75px;
  left: 80px;
  z-index: 10;
  padding: 6px 10px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
  max-width: 60%;
}

.latest-table table {
  border-collapse: collapse;
}

.latest-table th {
  font-weight: 600;
  padding: 2px 8px 2px 0;
  text-align: right;
  white-space: nowrap;
  opacity: 0.85;
}

.latest-table .th-name {
  text-align: left;
}

.latest-table td {
  padding: 2px 8px 2px 0;
  white-space: nowrap;
}

.latest-table .td-name {
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
}

.latest-table .td-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.latest-table .color-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.latest-table .latest-date {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
  text-align: right;
}
</style>
