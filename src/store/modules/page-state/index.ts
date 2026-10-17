import { reactive } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';

/** 页面状态快照（列表页筛选条件 + 分页） */
export interface PageStateSnapshot {
  /** 筛选参数（已 jsonClone，脱离组件 reactive 的引用） */
  searchParams: Record<string, any>;
  /** 当前页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 仅用于恢复瞬间的页码 clamp，随后会被首个响应覆盖 */
  itemCount: number;
  /** 保存时间戳（毫秒） */
  savedAt: number;
}

/**
 * 列表页状态记忆（筛选条件 + 分页）
 *
 * - key = 路由 name（如 bds_market-data_daily-valuations）
 * - **仅会话内有效（内存），不落 localStorage**：与批量同步表单记忆（bds store 的
 *   batchSyncForm）保持同一约定，避免三天前的筛选条件粘住用户；浏览器刷新即回默认。
 * - 只存筛选参数与分页页码，不存表格数据 ⇒ 每页开销几十字节，23 个列表页全访问过也可忽略。
 */
export const usePageStateStore = defineStore(SetupStoreId.PageState, () => {
  const snapshots = reactive<Record<string, PageStateSnapshot>>({});

  /** 读取快照（不存在返回 undefined） */
  function get(key: string) {
    return snapshots[key];
  }

  /** 写入快照（key 为空时忽略，防止路由未就绪时写入脏数据） */
  function save(key: string, snapshot: PageStateSnapshot) {
    if (!key) return;

    snapshots[key] = snapshot;
  }

  /** 清除单个页面的快照 */
  function clear(key: string) {
    delete snapshots[key];
  }

  /** 清除全部快照 */
  function clearAll() {
    Object.keys(snapshots).forEach(key => {
      delete snapshots[key];
    });
  }

  return {
    snapshots,
    get,
    save,
    clear,
    clearAll
  };
});
