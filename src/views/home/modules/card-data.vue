<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { useThemeStore } from '@/store/modules/theme';
import { fetchGroupAccs, syncGroupAcc } from '@/service/api';
import { executeSync } from '@/utils/sync-feedback';

defineOptions({
  name: 'CardData'
});

// 同步专用 loading：控制浮动盈亏卡片同步图标的动画
const syncLoading = ref(false);

interface CardData {
  key: string;
  title: string;
  value: number;
  unit: string;
  color: {
    start: string;
    end: string;
  };
  icon: string;
}

// 各卡片对应的金额，初始为 0，接口返回后更新
const cashAccTotal = ref<number>(0);
const valueTotalSum = ref<number>(0);
const accAsetTotal = ref<number>(0);
const pfTotalSum = ref<number>(0);
const plAllTotal = ref<number>(0);
const pflAllTotal = ref<number>(0);

// 卡片配置：标题对应后端 GroupAcc 模型 comment
// 顺序：资金余额 / 证券市值 / 账户净值 / 浮动盈亏 / 平仓盈亏 / 盈亏合计
const cardData = computed<CardData[]>(() => [
  {
    key: 'cashAcc',
    title: '资金余额',
    value: cashAccTotal.value,
    unit: '',
    color: { start: '#ec4786', end: '#b955a4' },
    icon: 'mdi:cash-multiple'
  },
  {
    key: 'valueTotal',
    title: '证券市值',
    value: valueTotalSum.value,
    unit: '',
    color: { start: '#865ec0', end: '#5144b4' },
    icon: 'mdi:chart-line'
  },
  {
    key: 'accAset',
    title: '账户净值',
    value: accAsetTotal.value,
    unit: '',
    color: { start: '#56cdf3', end: '#719de3' },
    icon: 'mdi:wallet'
  },
  {
    key: 'pfTotal',
    title: '浮动盈亏',
    value: pfTotalSum.value,
    unit: '',
    color: { start: '#41c77f', end: '#27ae60' },
    icon: 'mdi:chart-line-variant'
  },
  {
    key: 'plAll',
    title: '平仓盈亏',
    value: plAllTotal.value,
    unit: '',
    color: { start: '#fd7e14', end: '#e83e8c' },
    icon: 'mdi:chart-bell-curve'
  },
  {
    key: 'pflAll',
    title: '盈亏合计',
    value: pflAllTotal.value,
    unit: '',
    color: { start: '#fcbc25', end: '#f68057' },
    icon: 'mdi:finance'
  }
]);

interface GradientBgProps {
  gradientColor: string;
}

const [DefineGradientBg, GradientBg] = createReusableTemplate<GradientBgProps>();

const themeStore = useThemeStore();

function getGradientColor(color: CardData['color']) {
  return `linear-gradient(to bottom right, ${color.start}, ${color.end})`;
}

// 拉取账户汇总，取 account='合计' 的汇总记录填充 4 个卡片
async function fetchTotals() {
  const { data, error } = await fetchGroupAccs({ limit: 1000 });
  if (error || !data || !data.items) return;
  // 后端 upsert_group_acc_sql 在按账户分组后追加了 account='合计' 的汇总行
  const totalRow = data.items.find(item => item.account === '合计');
  if (!totalRow) return;
  // 各字段可能为 null，用 Number() 转换：null → 0
  cashAccTotal.value = Number(totalRow.cash_acc);
  valueTotalSum.value = Number(totalRow.value_total);
  accAsetTotal.value = Number(totalRow.acc_aset);
  pfTotalSum.value = Number(totalRow.pf_total);
  plAllTotal.value = Number(totalRow.pl_all);
  pflAllTotal.value = Number(totalRow.pfl_all);
}

// 触发账户汇总同步（与 bills/group-accs 页面的同步按钮调用相同接口）
async function handleSync() {
  await executeSync(syncGroupAcc, syncLoading, fetchTotals);
}

onMounted(fetchTotals);
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <!-- define component start: GradientBg -->
    <DefineGradientBg v-slot="{ $slots, gradientColor }">
      <div
        class="px-16px pb-4px pt-8px text-white"
        :style="{ backgroundImage: gradientColor, borderRadius: themeStore.themeRadius + 'px' }"
      >
        <component :is="$slots.default" />
      </div>
    </DefineGradientBg>
    <!-- define component end: GradientBg -->

    <NGrid cols="s:2 m:3 l:6" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi v-for="item in cardData" :key="item.key">
        <GradientBg :gradient-color="getGradientColor(item.color)" class="flex-1">
          <div class="flex items-center gap-6px">
            <h3 class="text-16px">{{ item.title }}</h3>
            <!-- 浮动盈亏卡片：标题后增加同步图标，点击触发账户汇总同步 -->
            <!-- SvgIcon 组件 inheritAttrs:false，@click 需绑在外层元素上 -->
            <span
              v-if="item.key === 'pfTotal'"
              :class="['inline-flex cursor-pointer opacity-60 hover:opacity-100 transition-opacity', syncLoading ? 'animate-spin' : '']"
              @click="handleSync"
            >
              <SvgIcon icon="mdi:sync" class="text-16px" />
            </span>
          </div>
          <div class="flex justify-between pt-12px">
            <SvgIcon :icon="item.icon" class="text-32px" />
            <CountTo
              :prefix="item.unit"
              :start-value="1"
              :end-value="item.value"
              :duration="300"
              class="text-30px text-white dark:text-dark"
            />
          </div>
        </GradientBg>
      </NGi>
    </NGrid>
  </NCard>
</template>

<style scoped></style>
