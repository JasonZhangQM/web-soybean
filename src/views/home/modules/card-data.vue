<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { useThemeStore } from '@/store/modules/theme';
import { fetchGroupAccs, fetchGroupSymbols, fetchSymbolInfos, fetchTradeDates } from '@/service/api';

defineOptions({
  name: 'CardData'
});

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

// 各卡片对应的总数，初始为 0，接口返回后更新
const symbolInfoTotal = ref<number>(0);
const tradeDateTotal = ref<number>(0);
const groupSymbolTotal = ref<number>(0);
const groupAccTotal = ref<number>(0);

// 卡片配置：标题用中文直接写，颜色与图标按需求设定
const cardData = computed<CardData[]>(() => [
  {
    key: 'symbolInfo',
    title: '证券信息',
    value: symbolInfoTotal.value,
    unit: '',
    color: { start: '#ec4786', end: '#b955a4' },
    icon: 'mdi:chart-donut'
  },
  {
    key: 'tradeDate',
    title: '交易日历',
    value: tradeDateTotal.value,
    unit: '',
    color: { start: '#865ec0', end: '#5144b4' },
    icon: 'mdi:calendar-month'
  },
  {
    key: 'groupSymbol',
    title: '持仓标的',
    value: groupSymbolTotal.value,
    unit: '',
    color: { start: '#56cdf3', end: '#719de3' },
    icon: 'mdi:chart-bell-curve'
  },
  {
    key: 'groupAcc',
    title: '账户数量',
    value: groupAccTotal.value,
    unit: '',
    color: { start: '#fcbc25', end: '#f68057' },
    icon: 'mdi:account-group'
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

// 并发获取 4 个总数，任一失败不影响其他
async function fetchTotals() {
  const results = await Promise.allSettled([
    fetchSymbolInfos({ limit: 1 }),
    fetchTradeDates({ limit: 1 }),
    fetchGroupSymbols({ limit: 1 }),
    fetchGroupAccs({ limit: 1 })
  ]);
  // 仅当请求成功且存在 data 时，写入对应的 total
  if (results[0].status === 'fulfilled' && results[0].value.data) {
    symbolInfoTotal.value = results[0].value.data.total;
  }
  if (results[1].status === 'fulfilled' && results[1].value.data) {
    tradeDateTotal.value = results[1].value.data.total;
  }
  if (results[2].status === 'fulfilled' && results[2].value.data) {
    groupSymbolTotal.value = results[2].value.data.total;
  }
  if (results[3].status === 'fulfilled' && results[3].value.data) {
    groupAccTotal.value = results[3].value.data.total;
  }
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

    <NGrid cols="s:1 m:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi v-for="item in cardData" :key="item.key">
        <GradientBg :gradient-color="getGradientColor(item.color)" class="flex-1">
          <h3 class="text-16px">{{ item.title }}</h3>
          <div class="flex justify-between pt-12px">
            <SvgIcon :icon="item.icon" class="text-32px" />
            <CountTo
              :prefix="item.unit"
              :start-value="1"
              :end-value="item.value"
              class="text-30px text-white dark:text-dark"
            />
          </div>
        </GradientBg>
      </NGi>
    </NGrid>
  </NCard>
</template>

<style scoped></style>
