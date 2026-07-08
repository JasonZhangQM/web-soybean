import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchIndexCodes } from '@/service/api/bds';

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

  return {
    indexCodeList,
    indexCodesLoaded,
    indexCodesLoading,
    loadIndexCodes,
    getIndexCodeOptions
  };
});
