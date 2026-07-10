import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchIndexCodes, fetchSymbolIndustries } from '@/service/api/bds';

export const useBdsStore = defineStore(SetupStoreId.Bds, () => {
  // 指数代码列表（全局缓存，首次加载时获取）
  const indexCodeList = ref<Api.Bds.IndexCodeItem[]>([]);
  const indexCodesLoaded = ref(false);
  const indexCodesLoading = ref(false);

  /** 加载指数代码列表 */
  async function loadIndexCodes(force = false) {
    if (indexCodesLoaded.value && !force) return;
    if (indexCodesLoading.value) return;
    indexCodesLoading.value = true;
    try {
      const { data, error } = await fetchIndexCodes();
      if (!error && data && Array.isArray(data.index_codes)) {
        indexCodeList.value = data.index_codes;
        indexCodesLoaded.value = true;
      }
    } catch (err) {
      console.error('[bds-store] 加载指数代码失败:', err);
    } finally {
      indexCodesLoading.value = false;
    }
  }

  /** 获取指数代码下拉选项（label=指数名称，value=指数代码） */
  function getIndexCodeOptions() {
    return indexCodeList.value.map(item => ({ label: item.sec_name, value: item.code }));
  }

  // 行业列表（全局缓存，后端 DISTINCT 去重，首次加载时获取）
  const industryList = ref<string[]>([]);
  const industriesLoaded = ref(false);
  const industriesLoading = ref(false);

  /** 加载去重后的行业列表 */
  async function loadIndustries(force = false) {
    if (industriesLoaded.value && !force) return;
    if (industriesLoading.value) return;
    industriesLoading.value = true;
    try {
      const { data, error } = await fetchSymbolIndustries();
      if (!error && data && Array.isArray(data.industries)) {
        industryList.value = data.industries;
        industriesLoaded.value = true;
      }
    } catch (err) {
      console.error('[bds-store] 加载行业列表失败:', err);
    } finally {
      industriesLoading.value = false;
    }
  }

  /** 获取行业下拉选项（label=行业名称，value=行业名称） */
  function getIndustryOptions() {
    return industryList.value.map(i => ({ label: i, value: i }));
  }

  return {
    indexCodeList,
    indexCodesLoaded,
    indexCodesLoading,
    loadIndexCodes,
    getIndexCodeOptions,
    industryList,
    industriesLoaded,
    industriesLoading,
    loadIndustries,
    getIndustryOptions
  };
});
