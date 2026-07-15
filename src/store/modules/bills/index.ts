import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchCategories, fetchAccounts, fetchGroupAccs, fetchGroupSymbols } from '@/service/api/bills';

export const useBillsStore = defineStore(SetupStoreId.Bills, () => {
  // 交易类别列表（全局缓存，首次加载时获取）
  const categoryList = ref<string[]>([]);
  const categoriesLoaded = ref(false);
  const categoriesLoading = ref(false);

  // 账户列表（全局缓存，首次加载时获取）
  const accountList = ref<string[]>([]);
  const accountsLoaded = ref(false);
  const accountsLoading = ref(false);

  /**
   * 通用列表加载函数（内部复用，避免重复代码）
   * @param fetchFn API 请求函数
   * @param listRef 列表 ref
   * @param loadedFlag 已加载标记 ref
   * @param loadingFlag 加载中标记 ref
   * @param dataKey 响应数据中的字段名
   * @param label 日志标签
   * @param force 是否强制重新加载
   */
  async function loadList(
    fetchFn: () => Promise<any>,
    listRef: ReturnType<typeof ref<string[]>>,
    loadedFlag: ReturnType<typeof ref<boolean>>,
    loadingFlag: ReturnType<typeof ref<boolean>>,
    dataKey: string,
    label: string,
    force = false
  ) {
    if (loadedFlag.value && !force) return;
    if (loadingFlag.value) return;
    loadingFlag.value = true;
    try {
      const { data, error } = await fetchFn();
      if (!error && data && Array.isArray(data[dataKey])) {
        listRef.value = data[dataKey];
        loadedFlag.value = true;
      }
    } catch (err) {
      console.error(`[bills-store] 加载${label}失败:`, err);
    } finally {
      loadingFlag.value = false;
    }
  }

  /** 加载交易类别列表 */
  async function loadCategories(force = false) {
    return loadList(fetchCategories, categoryList, categoriesLoaded, categoriesLoading, 'categories', '类别', force);
  }

  /** 加载账户列表 */
  async function loadAccounts(force = false) {
    return loadList(fetchAccounts, accountList, accountsLoaded, accountsLoading, 'accounts', '账户', force);
  }

  /** 获取类别下拉选项 */
  function getCategoryOptions() {
    return categoryList.value.map(c => ({ label: c, value: c }));
  }

  /** 获取账户下拉选项 */
  function getAccountOptions() {
    return accountList.value.map(a => ({ label: a, value: a }));
  }

  // ===== 首页图表共享数据缓存 =====
  // 首页多个子组件（card-data/pie-acc-chart/line-chart 等）共用同一份 group-accs 数据，
  // 避免各组件独立调接口导致重复请求；loaded/loading 标记防止重复加载

  // 账户汇总数据（首页共享，card-data / pie-acc-chart / line-chart 共用）
  const homeGroupAccs = ref<Api.Bills.GroupAcc[]>([]);
  const homeGroupAccsLoaded = ref(false);
  const homeGroupAccsLoading = ref(false);

  /** 加载首页账户汇总数据（limit=1000 全量，无筛选） */
  async function loadHomeGroupAccs(force = false) {
    if (homeGroupAccsLoaded.value && !force) return;
    if (homeGroupAccsLoading.value) return;
    homeGroupAccsLoading.value = true;
    try {
      const { data, error } = await fetchGroupAccs({ limit: 1000 });
      if (!error && data && Array.isArray(data.items)) {
        homeGroupAccs.value = data.items;
        homeGroupAccsLoaded.value = true;
      }
    } catch (err) {
      console.error('[bills-store] 加载首页账户汇总失败:', err);
    } finally {
      homeGroupAccsLoading.value = false;
    }
  }

  // 标的汇总数据（首页共享，bar-chart / pie-category-chart 共用）
  const homeGroupSymbols = ref<Api.Bills.GroupSymbol[]>([]);
  const homeGroupSymbolsLoaded = ref(false);
  const homeGroupSymbolsLoading = ref(false);

  /** 加载首页标的汇总数据（limit=1000 全量，无筛选） */
  async function loadHomeGroupSymbols(force = false) {
    if (homeGroupSymbolsLoaded.value && !force) return;
    if (homeGroupSymbolsLoading.value) return;
    homeGroupSymbolsLoading.value = true;
    try {
      const { data, error } = await fetchGroupSymbols({ limit: 1000 });
      if (!error && data && Array.isArray(data.items)) {
        homeGroupSymbols.value = data.items;
        homeGroupSymbolsLoaded.value = true;
      }
    } catch (err) {
      console.error('[bills-store] 加载首页标的汇总失败:', err);
    } finally {
      homeGroupSymbolsLoading.value = false;
    }
  }

  return {
    categoryList,
    categoriesLoaded,
    categoriesLoading,
    loadCategories,
    getCategoryOptions,
    accountList,
    accountsLoaded,
    accountsLoading,
    loadAccounts,
    getAccountOptions,
    homeGroupAccs,
    homeGroupAccsLoaded,
    homeGroupAccsLoading,
    loadHomeGroupAccs,
    homeGroupSymbols,
    homeGroupSymbolsLoaded,
    homeGroupSymbolsLoading,
    loadHomeGroupSymbols
  };
});
