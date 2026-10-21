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

/** 批量同步（卡片 1 财务及行情）表单快照 */
export interface BatchSyncFormState {
  scope: string;
  /** scope=index 时的指数代码清单（多选，后端取成分合集） */
  index_codes: string[];
  industry: string;
  symbols: string;
  tables: string[];
  mark_synced: boolean;
  /** 剔除 sync_at >= 该日期（YYYY-MM-DD）的标的；null=不跳过 */
  exclude_synced_since: string | null;
  /** 退市口径: trading=仅在市/delisted=仅退市/all=全部（仅作用于 all/industry/index） */
  trading_status: string;
  max_symbols: number;
}

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

  // 批量同步表单快照（会话级保持，切页/重进不丢；不落 localStorage，刷新即重置）
  // null = 尚未初始化过，由调用方走默认值
  const batchSyncForm = ref<BatchSyncFormState | null>(null);

  /** 写入批量同步表单快照 */
  function setBatchSyncForm(state: BatchSyncFormState) {
    batchSyncForm.value = { ...state, index_codes: [...state.index_codes], tables: [...state.tables] };
  }

  // 指数成分股同步：用户选中的指数（会话级保持，切页/重进不丢；不落 localStorage，刷新即重置）
  // null = 尚未初始化过，由调用方走「默认全选」
  const selectedIndexCodes = ref<string[] | null>(null);

  /** 写入选中的指数（由 batch-sync 卡片 2 调用） */
  function setSelectedIndexCodes(codes: string[]) {
    selectedIndexCodes.value = [...codes];
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
    return indicatorCodeList.value.map(item => ({
      label: item.indicator_short_name || item.indicator_name,
      value: item.indicator_code
    }));
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
    batchSyncForm,
    setBatchSyncForm,
    selectedIndexCodes,
    setSelectedIndexCodes,
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
