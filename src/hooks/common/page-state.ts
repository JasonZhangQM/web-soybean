import { toRaw, watch } from 'vue';
import { useRoute } from 'vue-router';
import { jsonClone } from '@sa/utils';
import { usePageStateStore } from '@/store/modules/page-state';
import type { TablePagination } from './table';

export interface UsePageStateOptions<T extends Record<string, any>> {
  /**
   * 存储 key，缺省取当前路由 name
   *
   * 仅在多个路由复用同一组件时才需要显式指定，避免状态串页。
   */
  key?: string;
  /** 页面的筛选参数对象（reactive，字段名不限：searchParams / queryForm 等均可） */
  searchParams: T;
  /** createTablePagination() 的返回值 */
  pagination: TablePagination;
}

/**
 * 列表页筛选条件与分页的会话记忆
 *
 * 背景：布局层 KeepAlive 的 include 只含声明了 `meta.keepAlive` 的路由，业务页面切
 * 标签页时组件会被销毁重建 ⇒ reactive 的筛选条件与页码全部丢失，`onMounted` 用初值
 * 重新拉数据，表现为「切回来筛选条件被清空」。
 *
 * 做法：在组件 setup 期**同步**把上次的条件与页码写回页面自己的 reactive 对象，随后
 * 页面既有的 `onMounted(() => fetchData())` 就会按旧条件、旧页码请求一次 —— 页面的
 * fetch 逻辑无需任何改动，也不需要 KeepAlive（组件仍会销毁，内存不常驻）。
 *
 * @example
 * const pagination = createTablePagination();
 * const searchParams = reactive<{ symbol?: string | null }>({});
 * usePageState({ searchParams, pagination });
 */
export function usePageState<T extends Record<string, any>>(options: UsePageStateOptions<T>) {
  const route = useRoute();
  const pageStateStore = usePageStateStore();

  const { searchParams, pagination } = options;
  const key = options.key ?? String(route.name ?? '');

  // 页面初值（供「先复位再赋值」用：后续版本新增的字段即使旧快照里没有，也回到初值）
  const initial = jsonClone(toRaw(searchParams)) as T;

  // ① 恢复：必须在页面 onMounted 的 fetch 之前完成，故在 setup 期同步执行
  const saved = pageStateStore.get(key);

  if (saved) {
    Object.keys(searchParams).forEach(field => {
      delete (searchParams as Record<string, any>)[field];
    });

    Object.assign(searchParams, initial, saved.searchParams);

    pagination.pageSize = saved.pageSize;
    // 先用旧总数让分页器自洽（避免恢复出「第 50 页 / 共 1 页」这种瞬间状态），
    // 首个响应回来后会被页面的 setPaginationTotal / itemCount 赋值覆盖
    pagination.itemCount = saved.itemCount;

    const maxPage = Math.max(1, Math.ceil(saved.itemCount / saved.pageSize));

    pagination.page = Math.min(Math.max(1, saved.page), maxPage);
  }

  /** 生成当前快照并写入 store */
  function snapshot() {
    pageStateStore.save(key, {
      searchParams: jsonClone(toRaw(searchParams)),
      page: pagination.page,
      pageSize: pagination.pageSize,
      itemCount: pagination.itemCount,
      savedAt: Date.now()
    });
  }

  // ② 变化即存：只监听筛选参数与 page/pageSize；
  //    不监听 itemCount —— 它每次响应都会被改写，监听会产生大量无意义写入
  watch([() => searchParams, () => pagination.page, () => pagination.pageSize], snapshot, { deep: true });

  return {
    /** 手动触发一次保存（页面极少需要，仅在绕开响应式赋值时使用） */
    saveNow: snapshot,
    /** 清除本页快照（如"重置"要连记忆一起清掉时使用） */
    clear: () => pageStateStore.clear(key)
  };
}
