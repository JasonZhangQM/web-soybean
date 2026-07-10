import type { Ref } from 'vue';

/** 后端同步返回的统一结构：兼容 bds/irs 的 message 与 bills 的 steps */
interface SyncResultData {
  status?: string;
  message?: string;
  steps?: Array<{ step: string; result: unknown }>;
  /** 成功更新的记录/代码数量（bds index-history 同步时返回） */
  updated_count?: number;
}

/** createFlatRequest 返回的形状 */
type FlatResponse<T> = { data: T | null; error: unknown };

/**
 * 执行同步任务并提供前端反馈：
 * - 按钮 loading 状态（独立 syncLoading，与表格 loading 分离）
 * - 防止重复点击（syncLoading 为 true 时直接返回）
 * - 成功消息提示：将后端返回的步骤结果或 message 拼接到消息中展示
 *
 * 注意：不触发顶部进度条（NLoadingBar），仅保留按钮自身的 loading 动画。
 * 页面顶部的进度条仅用于路由切换/页面刷新场景。
 *
 * @param syncFn 同步接口调用，返回 {data, error}
 * @param syncLoading loading 状态的 ref
 * @param onSuccess 成功回调（通常是刷新表格数据）
 */
export async function executeSync<T extends SyncResultData>(
  syncFn: () => Promise<FlatResponse<T>>,
  syncLoading: Ref<boolean>,
  onSuccess?: () => void | Promise<void>
) {
  // 防止重复点击：同步中再次点击直接忽略
  if (syncLoading.value) return;

  syncLoading.value = true;

  try {
    const { data, error } = await syncFn();

    if (!error && data) {
      // 根据后端返回的 status 选择消息级别：
      // - success：同步成功，刷新表格
      // - no_data：无数据可导入（如 gm 终端未启动），仅提示不刷新
      // - error：同步失败，仅提示不刷新
      // - 其他/缺省：按成功处理
      const status = data.status || 'success';
      const text = buildSyncText(data);
      if (status === 'error') {
        window.$message?.error(text);
      } else if (status === 'no_data') {
        window.$message?.warning(text);
      } else {
        window.$message?.success(text);
        await onSuccess?.();
      }
    } else {
      // 后端返回业务错误（如 HTTP 500）
      window.$message?.error('同步失败');
    }
  } catch {
    // 网络异常等未捕获错误
    window.$message?.error('同步异常');
  } finally {
    syncLoading.value = false;
  }
}

/**
 * 构建同步消息文本（不限成功场景）：
 * - bills 接口返回 steps 数组：拼接为「步骤名:结果」分号连接
 * - bds index-history 接口返回 updated_count：展示更新的指数数量
 * - bds/irs 接口返回 message 字符串：直接追加
 * - 都没有：仅返回「同步成功」
 */
function buildSyncText(data: SyncResultData): string {
  // bills 风格：有 steps 数组，拼接每步结果
  if (data.steps?.length) {
    const detail = data.steps.map(s => `${s.step}:${formatStepResult(s.result)}`).join('; ');
    return `同步成功：${detail}`;
  }

  // bds 风格：有 updated_count 字段，展示更新的记录条数
  if (typeof data.updated_count === 'number') {
    return `同步成功：更新${data.updated_count}条`;
  }

  // bds/irs 风格：有 message 字符串，直接返回（message 已含完整描述，
  // 如"同步完成：SHSE.600900，更新 65 条"或"无数据可导入：..."）
  if (data.message) {
    return data.message;
  }
  return '同步成功';
}

/** 格式化单步结果：数字表示更新行数，空值/字符串原样展示 */
function formatStepResult(result: unknown): string {
  if (result == null) return '完成';
  if (typeof result === 'number') return `更新${result}条`;
  if (typeof result === 'string') return result || '完成';
  return '完成';
}
