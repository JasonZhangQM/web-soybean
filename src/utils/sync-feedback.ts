import type { Ref } from 'vue';

/** 后端同步返回的统一结构：兼容 bds/irs 的 message 与 bills 的 steps */
interface SyncResultData {
  status?: string;
  message?: string;
  steps?: Array<{ step: string; result: unknown }>;
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
      // 将后端返回信息拼接到消息中展示
      window.$message?.success(buildSyncSuccessText(data));
      await onSuccess?.();
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
 * 构建同步成功消息文本：
 * - bills 接口返回 steps 数组：拼接为「步骤名:结果」分号连接
 * - bds/irs 接口返回 message 字符串：直接追加
 * - 都没有：仅返回「同步成功」
 */
function buildSyncSuccessText(data: SyncResultData): string {
  // bills 风格：有 steps 数组，拼接每步结果
  if (data.steps?.length) {
    const detail = data.steps.map(s => `${s.step}:${formatStepResult(s.result)}`).join('; ');
    return `同步成功：${detail}`;
  }

  // bds/irs 风格：有 message 字符串
  if (data.message) {
    return `同步成功：${data.message}`;
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
