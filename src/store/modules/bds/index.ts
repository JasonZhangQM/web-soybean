import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import {
  fetchEconomicIndicatorCodes,
  fetchGoldReserveCountries,
  fetchIndexCodes,
  fetchSymbolIndustries,
  fetchDailyIndicatorCodes
} from '@/service/api/bds';

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

  // 经济指标代码列表（全局缓存，首次加载时获取）
  const indicatorCodeList = ref<Api.Bds.EconomicIndicatorCode[]>([]);
  const indicatorCodesLoaded = ref(false);
  const indicatorCodesLoading = ref(false);

  /** 加载经济指标代码列表 */
  async function loadIndicatorCodes(force = false) {
    if (indicatorCodesLoaded.value && !force) return;
    if (indicatorCodesLoading.value) return;
    indicatorCodesLoading.value = true;
    try {
      const { data, error } = await fetchEconomicIndicatorCodes();
      if (!error && data && Array.isArray(data)) {
        indicatorCodeList.value = data;
        indicatorCodesLoaded.value = true;
      }
    } catch (err) {
      console.error('[bds-store] 加载经济指标代码失败:', err);
    } finally {
      indicatorCodesLoading.value = false;
    }
  }

  /** 获取经济指标代码下拉选项（label=指标简称兜底全称，value=指标代码） */
  function getIndicatorCodeOptions() {
    return indicatorCodeList.value.map(item => ({ label: item.indicator_short_name || item.indicator_name, value: item.indicator_code }));
  }

  // 黄金储备国家列表（全局缓存，后端 Config.GOLD_RESERVE_COUNTRIES 字典，首次加载时获取）
  const goldReserveCountryList = ref<Api.Bds.GoldReserveCountry[]>([]);

  /** 加载黄金储备国家列表 */
  async function loadGoldReserveCountries(force = false) {
    if (goldReserveCountryList.value.length > 0 && !force) return;
    const { data, error } = await fetchGoldReserveCountries();
    if (!error) {
      goldReserveCountryList.value = data.countries;
    }
  }

  /** 获取黄金储备国家下拉选项（label=国家名称，value=国家代码） */
  function getGoldReserveCountryOptions() {
    return goldReserveCountryList.value.map(item => ({ label: item.country_name, value: item.country_code }));
  }

  // 美债收益率指标代码列表（全局缓存，后端 Config.YIELD_INDICATORS 字典，首次加载时获取）
  const dailyIndicatorCodeList = ref<Api.Bds.DailyIndicatorCode[]>([]);
  const dailyIndicatorCodesLoaded = ref(false);
  const dailyIndicatorCodesLoading = ref(false);

  /** 加载美债收益率指标代码列表 */
  async function loadDailyIndicatorCodes(force = false) {
    if (dailyIndicatorCodesLoaded.value && !force) return;
    if (dailyIndicatorCodesLoading.value) return;
    dailyIndicatorCodesLoading.value = true;
    try {
      const { data, error } = await fetchDailyIndicatorCodes();
      if (!error && data && Array.isArray(data)) {
        dailyIndicatorCodeList.value = data;
        dailyIndicatorCodesLoaded.value = true;
      }
    } catch (err) {
      console.error('[bds-store] 加载美债收益率指标代码失败:', err);
    } finally {
      dailyIndicatorCodesLoading.value = false;
    }
  }

  /** 获取美债收益率指标代码下拉选项（label=指标简称，value=指标代码） */
  function getDailyIndicatorCodeOptions() {
    return dailyIndicatorCodeList.value.map(item => ({ label: item.indicator_short_name, value: item.indicator_code }));
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
    getIndustryOptions,
    indicatorCodeList,
    indicatorCodesLoaded,
    indicatorCodesLoading,
    loadIndicatorCodes,
    getIndicatorCodeOptions,
    goldReserveCountryList,
    loadGoldReserveCountries,
    getGoldReserveCountryOptions,
    dailyIndicatorCodeList,
    dailyIndicatorCodesLoaded,
    dailyIndicatorCodesLoading,
    loadDailyIndicatorCodes,
    getDailyIndicatorCodeOptions
  };
});
