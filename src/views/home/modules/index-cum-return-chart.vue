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

// 起始日期：默认展示最近十年数据
function getDefaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}
const startDate = ref<string | null>(getDefaultStartDate());

// 多色配色，按指数数量循环取色
const colors = ['#5da8ff', '#26deca', '#fedc69', '#ff7d85', '#a78bfa', '#34d399', '#fbbf24'];

// 最新数据行：每个指数的最新累计收益率 / 最大回撤（取最后一个非 null 值）
interface LatestRow {
  name: string;
  color: string;
  cumReturn: number | null;
  drawdown: number | null;
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
      // 第一行：x 轴日期
      let html = params[0].axisValue;
      // 仅处理累计收益率 series（名称不以 -回撤 结尾），回撤数据从对应 series 中查找
      const cumParams = params.filter((p: any) => !p.seriesName.endsWith('-回撤'));
      cumParams.forEach((p: any) => {
        // 查找同名的回撤 series
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
    top: '0',
    // 靠右放置，避免与左侧日期选择器重叠
    right: '4%',
    left: 'auto'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '15%',
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

// 拉取指数累计收益率，动态构造各指数折线
async function initData() {
  // startDate 为空时传 undefined，使用后端默认 30 天
  const { data, error } = await fetchIndexCumReturns({ start_date: startDate.value || undefined });
  // 接口失败或无数据时，保留空状态，不报错
  if (error || !data || !data.trade_dates || data.trade_dates.length === 0) return;

  const seriesNames = Object.keys(data.series);
  // 累计收益率折线（实线），使用左 Y 轴，按索引循环取色
  const cumSeries = seriesNames.map((name, idx) => ({
    color: colors[idx % colors.length],
    name,
    type: 'line',
    smooth: true,
    yAxisIndex: 0,
    data: data.series[name]
  }));
  // 最大回撤折线（仅面积填充），使用右 Y 轴（0在顶部，向下延伸形成倒山峰），与累计收益率同色
  const drawdownSeries = seriesNames.map((name, idx) => ({
    color: colors[idx % colors.length],
    name: `${name}-回撤`,
    type: 'line',
    smooth: true,
    yAxisIndex: 1,
    lineStyle: { opacity: 0 },
    symbol: 'none',
    areaStyle: { opacity: 0.2 },
    data: data.max_drawdown[name]
  }));

  const chartSeries = [...cumSeries, ...drawdownSeries];
  // legend 包含累计收益率名称与回撤名称
  // const allNames = [...seriesNames, ...seriesNames.map(n => `${n}-回撤`)];
  const allNames = [...seriesNames];

  updateOptions(opts => {
    opts.legend.data = allNames;
    opts.xAxis.data = data.trade_dates;
    opts.series = chartSeries as never;

    // 动态计算左轴（累计收益率）范围，右轴（最大回撤）对称取负，保证刻度跨度一致
    const allCumReturns = seriesNames.flatMap(n => data.series[n] ?? []);
    const cumMax = Math.max(0, ...allCumReturns.filter((v): v is number => v !== null));
    const cumMin = Math.min(0, ...allCumReturns.filter((v): v is number => v !== null));
    // 左轴最小值向下取整到10的倍数，最大值向上取整到10的倍数
    const leftMin = Math.floor(cumMin / 10) * 10;
    const leftMax = Math.ceil(cumMax / 10) * 10;
    // 右轴0在顶部，min为左轴范围的负值，保证跨度对称
    const rightMin = -(leftMax - leftMin);

    opts.yAxis[0].min = leftMin;
    opts.yAxis[0].max = leftMax;
    opts.yAxis[1].min = rightMin;
    // yAxis[1].max 已在初始化时设为 0

    return opts;
  });

  // 计算每个指数的最新累计收益率 / 最大回撤（取最后一个非 null 值及对应日期）
  // 表格固定显示在图表左下方，便于快速查看最新状态
  const lastIdx = data.trade_dates.length - 1;
  const rows: LatestRow[] = seriesNames.map((name, idx) => {
    const cumArr = data.series[name] ?? [];
    const ddArr = data.max_drawdown[name] ?? [];
    // 从末尾向前查找最后一个非 null 值
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
    return {
      name,
      color: colors[idx % colors.length],
      cumReturn: cumVal,
      drawdown: ddVal,
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

// 语言切换时刷新（指数名称为固定中文，此处保持原刷新逻辑）
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

// 日期选择器值变动时重新拉取数据
function handleDateChange() {
  init();
}

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
    <!-- 外层 relative 包裹：日期选择器绝对定位与 legend 同行，左边对齐累计收益率区域 -->
    <div class="relative h-480px overflow-hidden">
      <!-- 日期选择器：绝对定位左上角，z-10 确保在 echarts canvas 之上 -->
      <div class="absolute top-0 flex items-center z-10" style="left: 3%">
        <span class="mr-8px text-14px text-color-2">起始日期</span>
        <NDatePicker
          v-model:formatted-value="startDate"
          type="date"
          value-format="yyyy-MM-dd"
          clearable
          placeholder="默认近10年"
          :shortcuts="dateShortcuts"
          :style="{ width: '150px' }"
          @update:formatted-value="handleDateChange"
        />
        <!-- 同步按钮：参照浮动盈亏卡片样式，SvgIcon inheritAttrs:false 故 @click 绑在外层 span -->
        <span
          :class="['inline-flex cursor-pointer opacity-60 hover:opacity-100 transition-opacity ml-8px', syncLoading ? 'animate-spin' : '']"
          @click="handleSync"
        >
          <SvgIcon icon="mdi:sync" class="text-16px" />
        </span>
      </div>
      <!-- echarts 容器：单独 div，避免被 echarts 清空 innerHTML 时覆盖日期选择器 -->
      <div ref="domRef" class="h-480px"></div>
      <!-- 最新数据表格：绝对定位左下方，半透明背景，pointer-events:none 不遮挡 echarts 交互 -->
      <div
        v-if="latestRows.length"
        class="latest-table"
        :style="tableStyle"
      >
        <table>
          <thead>
            <tr>
              <th class="th-name">指数</th>
              <th class="th-num">累计收益率(%)</th>
              <th class="th-num">最大回撤(%)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in latestRows" :key="row.name">
              <td class="td-name">
                <span class="color-dot" :style="{ background: row.color }"></span>
                <span>{{ row.name }}</span>
              </td>
              <td class="td-num">{{ fmt(row.cumReturn) }}</td>
              <td class="td-num">{{ fmt(row.drawdown) }}</td>
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
  /* 与右轴 0 值水平对齐（图表顶部 15% + 顶部内边距，避开 Y 轴名称） */
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
  /* 不遮挡 echarts 鼠标事件 */
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
