<script setup lang="ts">
/**
 * 标的卡片（风险总览 /risk 左栏，2026-11-13 自今日页 TodayCard 精简而来）
 *
 * 今日待办页下线后，卡片只保留「风险总览」需要的部分：
 *   标题（名称 / 代码 / 档位带）→ 现价 + PE/PB 分位 → 档位刻度条 → footer 插槽（假设价滑块）。
 * 已去掉的待办属性：优先级标签、命中剧本、逻辑/证伪/复核/裸仓、目标/当前/漂移、设目标按钮
 * —— 那些来自 GET /irs/today 的待办组装，随该接口一并下线；要看得打开档案抽屉。
 *
 * 数据由父页 types.toSubjectRow 归一化（um 表五档列是 varchar，需 Number 化），
 * 组件本身不做任何口径换算（🔒4.13）。
 */
import { NButton, NCard, NTag } from 'naive-ui';
import TierScaleBar from './TierScaleBar.vue';
import type { SubjectRow } from './types';

defineProps<{
  subject: SubjectRow;
  /** 假设价：传了就在刻度条上叠第二游标并亮「已改动」角标 */
  hypoPrice?: number | null;
  /** 是否与现价不同（驱动「已改动」角标） */
  changed?: boolean;
}>();

const emit = defineEmits<{ detail: [] }>();

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

/** 刻度条可渲染条件：五档齐全且严格递增、有现价（防手填数据错序） */
function tierBarOk(s: SubjectRow) {
  if (!s.pp || !s.pv || s.price == null) return false;
  const seq = [s.pp.el, s.pp.l, s.pp.m, s.pp.h, s.pp.eh];
  return seq.every(v => v != null) && seq.every((v, i) => i === 0 || Number(seq[i - 1]) < Number(v));
}
</script>

<template>
  <NCard size="small">
    <template #header>
      <div class="flex flex-wrap items-center gap-8px">
        <NButton text class="font-600" @click="emit('detail')">
          {{ subject.name || subject.symbol }}
        </NButton>
        <span class="text-12px text-gray-400">{{ subject.symbol }}</span>
        <NTag size="tiny" :bordered="false" type="info">{{ subject.zone || '—' }}</NTag>
        <NTag v-if="changed" size="tiny" :bordered="false" round class="!text-green-500">已改动</NTag>
      </div>
    </template>

    <div class="flex flex-col gap-8px">
      <!-- 现价 + PE/PB 分位（分位是「贵不贵」的唯一读数，保留） -->
      <div class="flex flex-wrap items-baseline gap-8px">
        <span class="text-20px font-600">{{ fmtPrice(subject.price) }}</span>
        <NTag v-if="subject.pe_pct != null || subject.pb_pct != null" size="tiny" :bordered="false" type="warning">
          PE {{ fmtPct100(subject.pe_pct) }} / PB {{ fmtPct100(subject.pb_pct) }}
        </NTag>
        <span v-if="subject.pe_pct != null || subject.pb_pct != null" class="text-11px text-gray-400">10y 分位</span>
      </div>

      <!-- 档位刻度条（五档价与距档 % 直接标在刻度下）；数据无效时只留档位带 -->
      <TierScaleBar
        v-if="tierBarOk(subject)"
        :pp="subject.pp"
        :pv="subject.pv"
        :price="subject.price"
        :hypo-price="hypoPrice"
      />
      <div v-else class="flex flex-wrap items-center gap-8px">
        <NTag size="small" :bordered="false" type="info">{{ subject.zone || '—' }}</NTag>
        <span class="text-12px text-gray-400">无五档版本</span>
      </div>

      <!-- 扩展插槽（假设价滑块） -->
      <slot name="footer" />
    </div>
  </NCard>
</template>
