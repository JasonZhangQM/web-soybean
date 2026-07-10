import { ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { fetchSymbolInfos } from '@/service/api';

/** 股票代码下拉选项类型 */
type SymbolOption = { label: string; value: string };

/**
 * 股票代码远程搜索 composable
 *
 * NSelect remote 模式，防抖 300ms 调后端 /symbol-infos，
 * 用 keyword 对代码或名称做 OR 模糊匹配，下拉展示 "symbol name (industry)"。
 * 每次调用返回独立的 options/loading 状态，适合同一页面多框复用。
 */
export function useSymbolSearch() {
  const symbolOptions = ref<SymbolOption[]>([]);
  const symbolLoading = ref(false);

  /** 远程搜索：返回 "symbol name (industry)" 格式选项数组 */
  async function fetchSymbolOptions(query: string): Promise<SymbolOption[]> {
    if (!query) return [];
    const { data, error } = await fetchSymbolInfos({ keyword: query, limit: 20 });
    if (!error && data) {
      return data.items.map(item => ({
        label: `${item.symbol} ${item.name} (${item.industry ?? '-'})`,
        value: item.symbol
      }));
    }
    return [];
  }

  /** 防抖 300ms 远程搜索（供 NSelect @search 使用） */
  const handleSymbolSearch = useDebounceFn(async (query: string) => {
    symbolLoading.value = true;
    try {
      symbolOptions.value = await fetchSymbolOptions(query);
    } finally {
      symbolLoading.value = false;
    }
  }, 300);

  /** 清空选项（重置搜索条件时调用） */
  function clearSymbolOptions() {
    symbolOptions.value = [];
  }

  return {
    symbolOptions,
    symbolLoading,
    handleSymbolSearch,
    clearSymbolOptions
  };
}
