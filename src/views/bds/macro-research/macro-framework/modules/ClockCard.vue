<script setup lang="ts">
import { computed } from 'vue';
import { getLatest } from '../../economic-dashboard/modules/utils';

defineOptions({ name: 'ClockCard' });

/**
 * 美林投资时钟 · 周期定位卡片
 * 基于 GDP 同比（增长方向）与 CPI 同比（通胀水平）判断当前所处周期阶段
 * 并给出各阶段对应的最优资产配置与行业偏好建议
 */
interface Props {
  /** 指标数据映射（key 为 indicator_code，value 为按 report_date 升序的时序数组） */
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>;
}

const props = defineProps<Props>();

/** 阶段展示信息 */
interface PhaseInfo {
  /** 阶段名称 */
  name: string;
  /** 特征描述 */
  feature: string;
  /** 最优资产配置 */
  asset: string;
  /** 行业偏好 */
  industry: string;
  /** 阶段主题色 */
  color: string;
}

/** 五阶段静态映射表（数据不足不在此表中，单独处理） */
const PHASE_MAP: Record<string, PhaseInfo> = {
  recovery: {
    name: '复苏期',
    feature: '增长上行 + 通胀下行',
    asset: '股票 > 债券 > 现金 > 商品',
    industry: '科技、可选消费、金融',
    color: '#16a34a'
  },
  overheating: {
    name: '过热期',
    feature: '增长上行 + 通胀上行',
    asset: '商品 > 股票 > 现金/债券',
    industry: '周期股（有色、钢铁、化工）',
    color: '#dc2626'
  },
  stagflation: {
    name: '滞胀期',
    feature: '增长下行 + 通胀上行',
    asset: '现金 > 商品 > 债券 > 股票',
    industry: '防御性行业（医药、必选消费、公用事业）',
    color: '#ea580c'
  },
  recession: {
    name: '衰退期',
    feature: '增长下行 + 通胀下行',
    asset: '债券 > 现金 > 股票 > 商品',
    industry: '债券型基金、高股息防御',
    color: '#2563eb'
  },
  transition: {
    name: '过渡期',
    feature: '通胀温和，周期信号不明确',
    asset: '均衡配置',
    industry: '关注先行指标拐点',
    color: '#6b7280'
  }
};

// GDP 同比最新记录
const gdpLatest = computed(() => getLatest(props.dataMap, 'CN_GDP_YOY'));
// CPI 同比最新记录
const cpiLatest = computed(() => getLatest(props.dataMap, 'CN_CPI_YOY'));

/**
 * 增长方向：最新值 > 前值 = 上行，< 前值 = 下行，= 前值或前值为空 = 持平
 * 前值优先取 value_prev 字段，缺失时回退到倒数第二条记录的 value
 */
const growth = computed<'up' | 'down' | 'flat'>(() => {
  const latest = gdpLatest.value;
  if (!latest) return 'flat';
  const cur = Number(latest.value);
  // 优先使用 value_prev 字段
  let prev: number | null = latest.value_prev != null ? Number(latest.value_prev) : null;
  // value_prev 缺失时，回退到倒数第二条记录
  if (prev == null) {
    const list = props.dataMap.get('CN_GDP_YOY');
    if (list && list.length >= 2) {
      const prevRecord = list[list.length - 2];
      prev = prevRecord.value != null ? Number(prevRecord.value) : null;
    }
  }
  if (prev == null || cur === prev) return 'flat';
  return cur > prev ? 'up' : 'down';
});

/**
 * 通胀水平：CPI >= 3 高通胀，0~3 温和，< 0 通缩
 */
const inflation = computed<'high' | 'moderate' | 'deflation'>(() => {
  const latest = cpiLatest.value;
  if (!latest) return 'moderate';
  const v = Number(latest.value);
  if (v >= 3) return 'high';
  if (v < 0) return 'deflation';
  return 'moderate';
});

/**
 * 美林时钟四阶段 + 过渡期判断
 * - 复苏 = 增长上行 + 通缩
 * - 过热 = 增长上行 + 高通胀
 * - 滞胀 = 增长下行 + 高通胀
 * - 衰退 = 增长下行 + 通缩
 * - 其余（含增长持平/通胀温和）= 过渡期
 * - GDP 或 CPI 数据缺失 = insufficient（数据不足）
 */
const phaseKey = computed<string>(() => {
  if (!gdpLatest.value || !cpiLatest.value) return 'insufficient';
  if (growth.value === 'up' && inflation.value === 'deflation') return 'recovery';
  if (growth.value === 'up' && inflation.value === 'high') return 'overheating';
  if (growth.value === 'down' && inflation.value === 'high') return 'stagflation';
  if (growth.value === 'down' && inflation.value === 'deflation') return 'recession';
  return 'transition';
});

/** 阶段展示信息（数据不足时返回 null，不显示阶段信息） */
const phaseInfo = computed<PhaseInfo | null>(() => {
  if (phaseKey.value === 'insufficient') return null;
  return PHASE_MAP[phaseKey.value] ?? null;
});

/** 增长方向箭头 */
const growthArrow = computed(() => {
  switch (growth.value) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    default:
      return '→';
  }
});

/** 增长方向颜色：红涨绿跌（中国股市惯例） */
const growthColor = computed(() => {
  switch (growth.value) {
    case 'up':
      return '#dc2626';
    case 'down':
      return '#16a34a';
    default:
      return '#6b7280';
  }
});

/** 格式化数值：保留 2 位小数，null/空显示 -- */
function fmtVal(v: number | string | null | undefined): string {
  if (v == null || v === '') return '--';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}
</script>

<template>
  <NCard title="美林投资时钟 · 周期定位" :bordered="false" class="clock-card card-wrapper" size="small">
    <!-- 阶段主体：左阶段名 + 右配置建议 -->
    <div v-if="phaseInfo" class="clock-card__body">
      <div class="clock-card__left">
        <div class="clock-card__phase" :style="{ color: phaseInfo.color }">
          {{ phaseInfo.name }}
        </div>
        <div class="clock-card__feature">{{ phaseInfo.feature }}</div>
      </div>
      <div class="clock-card__right">
        <div class="clock-card__item">
          <span class="clock-card__label">最优资产配置</span>
          <span class="clock-card__value">{{ phaseInfo.asset }}</span>
        </div>
        <div class="clock-card__item">
          <span class="clock-card__label">行业偏好</span>
          <span class="clock-card__value">{{ phaseInfo.industry }}</span>
        </div>
      </div>
    </div>
    <!-- 数据不足占位 -->
    <div v-else class="clock-card__empty">
      GDP 或 CPI 数据不足，无法判断周期阶段
    </div>
    <!-- 数据基准：展示判断依据的原始指标值 -->
    <div v-if="gdpLatest || cpiLatest" class="clock-card__footer">
      <span v-if="gdpLatest" class="clock-card__data">
        GDP 同比: <strong>{{ fmtVal(gdpLatest.value) }}%</strong>
        <span class="clock-card__arrow" :style="{ color: growthColor }">{{ growthArrow }}</span>
      </span>
      <span v-if="gdpLatest && cpiLatest" class="clock-card__sep">|</span>
      <span v-if="cpiLatest" class="clock-card__data">
        CPI 同比: <strong>{{ fmtVal(cpiLatest.value) }}%</strong>
      </span>
    </div>
  </NCard>
</template>

<style scoped>
/* 主体区域：左右分栏，窄屏堆叠 */
.clock-card__body {
  display: flex;
  gap: 24px;
  align-items: stretch;
}

@media (max-width: 640px) {
  .clock-card__body {
    flex-direction: column;
    gap: 12px;
  }
}

/* 左侧：阶段名称 + 特征 */
.clock-card__left {
  flex: 0 0 auto;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.clock-card__phase {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.1;
}

.clock-card__feature {
  font-size: 0.8rem;
  color: var(--muted, #6b7280);
}

/* 右侧：资产配置 + 行业偏好 */
.clock-card__right {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  border-left: 1px solid var(--rule, #e5e7eb);
  padding-left: 24px;
}

@media (max-width: 640px) {
  .clock-card__right {
    border-left: none;
    border-top: 1px solid var(--rule, #e5e7eb);
    padding-left: 0;
    padding-top: 12px;
  }
}

.clock-card__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clock-card__label {
  font-size: 0.72rem;
  color: var(--muted, #6b7280);
}

.clock-card__value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink, #1a1a2e);
}

/* 数据不足占位 */
.clock-card__empty {
  padding: 24px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--muted, #6b7280);
}

/* 底部数据基准 */
.clock-card__footer {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule, #e5e7eb);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
}

.clock-card__data strong {
  color: var(--ink, #1a1a2e);
  font-weight: 600;
}

.clock-card__arrow {
  font-weight: 700;
  margin-left: 2px;
}

.clock-card__sep {
  color: var(--rule, #d1d5db);
}
</style>
