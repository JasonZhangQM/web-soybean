import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchCategories, fetchAccounts } from '@/service/api/bills';

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
    getAccountOptions
  };
});
