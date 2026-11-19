<script setup lang="ts">
/**
 * 标的卡片（风险总览 /risk 左栏，2026-11-13 自今日页 TodayCard 精简而来）
 *
 * 今日待办页下线后，卡片只保留「风险总览」需要的部分：
 *   标题（名称 / 风险敞口 / 市值 / 浮动盈亏）→ 现价 + PE/PB 分位 → 档位刻度条 → footer 读数行。
 * 2026-11-17 标题行改版：代码不再展示（名称即入口），敞口后新增市值与浮动盈亏——
 * 两项由后端从 bills_group_symbol 按归属标的聚合（value_total / pf_total），与
 * /bills/group-symbols 页面同源；盈亏着色沿用本页 signCls 惯例（正=绿、负=红）。
 * 2026-11-15 档位条与快速定位滑块合一：色带可拖可点、下方五档标签点击到档，
 * 独立 NSlider 从主路径下线；仅当 types.tierBarOk 为 false（无五档版本）时，
 * footer 才由父页补一个降级 NSlider（否则这类标的将完全无法设假设价）。
 * footer 插槽用 tiers 把判据透给父页，两侧不各写一份。
 * 档位带不再放标题行（让位给敞口），只在无五档版本的回退分支里出现。
 * 已去掉的待办属性：优先级标签、命中剧本、逻辑/证伪/复核/裸仓、目标/当前/漂移、设目标按钮
 * —— 那些来自 GET /irs/today 的待办组装，随该接口一并下线；要看得打开档案抽屉。
 *
 * 数据由父页 types.toSubjectRow 归一化（um 表五档列是 varchar，需 Number 化），
 * 组件本身不做任何口径换算（🔒4.13），档位条只发定位结果、由父页写 overrides。
 */
import { NButton, NCard, NTag } from 'naive-ui';
import TierScaleBar from './TierScaleBar.vue';
import { type SubjectRow, tierBarOk } from './types';

defineProps<{
  subject: SubjectRow;
  /** 假设价：传了就在刻度条上叠第二游标 */
  hypoPrice?: number | null;
}>();

/** 档位条定位结果透传给父页 setHypo；回现价由读数行按钮直接调父页 resetHypo */
const emit = defineEmits<{ detail: []; pick: [number] }>();

/** 价格：去尾零，最多 4 位（与全站 fmtPrice 同口径，此处内联避免引 risk-board 工具） */
function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v)
    .toFixed(4)
    .replace(/\.?0+$/, '');
}

/** 分位：后端已给 0~100，直接补 % */
function fmtPct100(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

/**
 * 风险敞口 / 市值 / 浮动盈亏（标的项下持仓聚合，后端从 bills_group_symbol 汇总）：
 * 金额口语化，|v| ≥ 1 万用「万」省位（卡片 380px，整值读不动）；空值显示「—」，不伪造 0。
 * 口径与标的监测列表页 fmtMoneyShort 同源，此处内联避免引 risk-board 工具。
 */
function fmtExposure(v: number | null | undefined) {
  if (v == null) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 盈亏着色：正=绿、负=红（与 /risk 页 signCls 同一惯例），空值 / 0 不着色 */
function pnlCls(v: number | null | undefined) {
  if (v == null || Math.abs(Number(v)) < 1e-9) return '';
  return Number(v) > 0 ? 'text-green-500' : 'text-red-500';
}
</script>

<template>
  <NCard size="small">
    <template #header>
      <div class="flex flex-wrap items-center gap-8px">
        <NButton text class="font-600" @click="emit('detail')">
          {{ subject.name || subject.symbol }}
        </NButton>
        <!-- 风险敞口 / 市值 / 浮动盈亏（标的项下持仓聚合，bills_group_symbol 口径）；档位带不再占头部 -->
        <span class="text-12px" :class="subject.risk_exposure == null ? 'text-gray-400' : 'font-600'">
          敞口 {{ fmtExposure(subject.risk_exposure) }}
        </span>
        <span class="text-12px" :class="subject.value_total == null ? 'text-gray-400' : 'font-600'">
          市值 {{ fmtExposure(subject.value_total) }}
        </span>
        <span
          class="text-12px"
          :class="subject.pf_total == null ? 'text-gray-400' : ['font-600', pnlCls(subject.pf_total)]"
        >
          盈亏 {{ fmtExposure(subject.pf_total) }}
        </span>
      </div>
    </template>

    <div class="flex flex-col gap-8px">
      <!-- 现价 + PE/PB 分位（分位是「贵不贵」的唯一读数）；敞口 / 市值 / 盈亏已在标题行 -->
      <div class="flex flex-wrap items-baseline gap-8px">
        <span class="text-20px font-600">{{ fmtPrice(subject.price) }}</span>
        <NTag v-if="subject.pe_pct != null || subject.pb_pct != null" size="tiny" :bordered="false" type="warning">
          PE {{ fmtPct100(subject.pe_pct) }} / PB {{ fmtPct100(subject.pb_pct) }}
        </NTag>
        <span v-if="subject.pe_pct != null || subject.pb_pct != null" class="text-11px text-gray-400">10y 分位</span>
      </div>

      <!-- 档位刻度条即定位轴（拖动色带 / 点击五档标签）；数据无效时只留档位带 -->
      <TierScaleBar
        v-if="tierBarOk(subject)"
        :pp="subject.pp"
        :pv="subject.pv"
        :price="subject.price"
        :hypo-price="hypoPrice"
        @pick="(v: number) => emit('pick', v)"
      />
      <div v-else class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" type="info">{{ subject.zone || '—' }}</NTag>
        <span class="text-12px text-gray-400">无五档版本</span>
      </div>

      <!-- 扩展插槽：读数行常驻；无五档版本时父页在此补降级 NSlider -->
      <slot name="footer" :tiers="tierBarOk(subject)" />
    </div>
  </NCard>
</template>
