import { fetchSyncTask, syncGroup, syncIrs, syncOptionMarket } from '@/service/api';

/**
 * 「一键行情更新」链式编排（2026-11-16 方案 A：纯前端聚合，后端零改动）
 *
 * 三个行情入口原本分散在三处按钮：期权行情（bds 后台任务）、标的行情（irs 同步）、
 * 持仓行情（bills 四步）。持仓估值读 bds_option_market 本地快照 ⇒ 必须按依赖顺序执行：
 *
 *   期权行情 → 标的行情 → 持仓行情
 *
 * 顺序颠倒会导致风险看板吃到 T−1 / 混日快照（期权没更新时持仓估值回退旧价）。
 * irs 与 bills 解耦、跨模块能力前端聚合，故编排放在本工具而不是后端。
 *
 * 反馈走全局 window.$message（与 sync-feedback.executeSync 同一套），逐步报进度；
 * 任一步失败立即中断并提示「第 N 步」，no_data（如 gm 终端未启动）不算失败、继续走。
 */

/** 执行结果：ok = 三步全部走完（含 no_data）；调用方据此决定是否刷新数据 */
export interface MarketChainResult {
  ok: boolean;
  /** 聚合摘要（已逐步 window.$message 提示过，这里供调用方做最终汇总展示） */
  message: string;
}

interface SyncStatusData {
  status?: string;
  message?: string;
}

/** createFlatRequest 返回的形状 */
type FlatResponse<T> = { data: T | null; error: unknown };

/** 轮询间隔与兜底超时（期权任务通常几秒~几十秒，10 分钟足够；超时防悬挂） */
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 10 * 60 * 1000;

/**
 * 轮询 bds_sync_task 直到终态（done / failed / stopped）。
 * 与页面轮询不同：这里不跳过 document.hidden —— 编排是 await 语义，
 * 页面隐藏时也要让链走完，否则调用方的 finally 永远不触发。
 */
function pollSyncTask(taskId: number): Promise<Api.Bds.SyncTask> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      try {
        const { data, error } = await fetchSyncTask(taskId);
        // 单次取数失败（网络抖动）忽略，下一轮重试
        if (error || !data) return;
        if (!['pending', 'running'].includes(data.status)) {
          clearInterval(timer);
          resolve(data);
        } else if (Date.now() - startedAt > POLL_TIMEOUT) {
          clearInterval(timer);
          reject(new Error(`轮询超时（${POLL_TIMEOUT / 60000} 分钟），请稍后到任务列表查看任务 #${taskId}`));
        }
      } catch {
        // 网络异常忽略，下一轮重试
      }
    }, POLL_INTERVAL);
  });
}

/** 从期权任务 result 里提取简短摘要（口径与期权行情页一致：组数 + 行数） */
function optionTaskSummary(task: Api.Bds.SyncTask): string {
  const r = (task.result || {}) as Record<string, number>;
  return `成功 ${r.group_ok ?? 0}/${r.group_total ?? 0} 组，新增 ${r.row_insert ?? 0} 行，更新 ${r.row_update ?? 0} 行`;
}

/** 标的 / 持仓两步的统一执行：success 继续、no_data 警告继续、error 中断 */
async function runSimpleStep(stepNo: number, name: string, fn: () => Promise<FlatResponse<SyncStatusData>>) {
  window.$message?.loading(`步骤 ${stepNo}/3：${name}同步中…`, { duration: 3000 });
  const { data, error } = await fn();
  if (error || !data) {
    throw new Error((error as { message?: string } | null)?.message || `${name}同步请求失败`);
  }
  const status = data.status || 'success';
  if (status === 'error') {
    throw new Error(data.message || `${name}同步失败`);
  }
  if (status === 'no_data') {
    // 无数据可导入（如 gm 终端未启动）：不算失败，继续走链
    window.$message?.warning(`步骤 ${stepNo}/3：${data.message || `${name}无数据可导入`}`);
    return data.message || `${name}无数据`;
  }
  window.$message?.success(`步骤 ${stepNo}/3：${data.message || `${name}同步成功`}`);
  return data.message || `${name}同步成功`;
}

/**
 * 执行行情更新链，逐步在全局消息里报进度：
 * - includeOptionMarket = true（默认）：期权行情（后台任务 + 轮询到终态）→ 标的 → 持仓；
 * - includeOptionMarket = false：只跑后两步（/batch-sync 宏观任务里期权行情段
 *   已由后端跑完时，前端只需追加这两步，不必再起一次期权任务）。
 *
 * 返回 ok = 是否全部成功；失败时已逐步提示原因，调用方一般只需按 ok 决定刷不刷新。
 */
export async function executeMarketChain(opts?: { includeOptionMarket?: boolean }): Promise<MarketChainResult> {
  const includeOptionMarket = opts?.includeOptionMarket !== false;
  const parts: string[] = [];

  // 步骤 1：期权行情 —— bds 后台任务，立即返回 task，轮询到终态
  if (includeOptionMarket) {
    window.$message?.loading('步骤 1/3：期权行情同步中…', { duration: 3000 });
    const { data, error } = await syncOptionMarket({ silent: true });
    if (error || !data) {
      const msg = (error as { message?: string } | null)?.message || '期权行情任务启动失败';
      window.$message?.error(`第 1 步（期权行情）失败：${msg}`);
      return { ok: false, message: msg };
    }
    const task = await pollSyncTask(data.id);
    if (task.status === 'failed') {
      const msg = task.errors?.[0]?.message || '未知错误';
      window.$message?.error(`第 1 步（期权行情）失败：${msg}`);
      return { ok: false, message: msg };
    }
    if (task.status === 'stopped') {
      const msg = '期权行情任务被停止，已中断后续步骤';
      window.$message?.warning(msg);
      return { ok: false, message: msg };
    }
    const summary = optionTaskSummary(task);
    if ((task.result as Record<string, number> | null)?.group_failed) {
      window.$message?.warning(`步骤 1/3：期权行情${summary}，部分组失败（详见任务审计）`);
    } else {
      window.$message?.success(`步骤 1/3：期权行情${summary}`);
    }
    parts.push(`期权：${summary}`);
  }

  // 步骤 2：标的行情（irs：gm current → um.price → pv_* 钩子）
  try {
    const msg = await runSimpleStep(2, '标的行情', () => syncIrs('underlying-monitor'));
    parts.push(`标的：${msg}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    window.$message?.error(`第 2 步（标的行情）失败：${msg}`);
    return { ok: false, message: msg };
  }

  // 步骤 3：持仓行情（bills 四步：实时估值 → 清零 → 账户汇总 → 标的汇总）
  try {
    const msg = await runSimpleStep(3, '持仓行情', () => syncGroup());
    parts.push(`持仓：${msg}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    window.$message?.error(`第 3 步（持仓行情）失败：${msg}`);
    return { ok: false, message: msg };
  }

  const message = parts.join('；');
  window.$message?.success('一键行情更新完成');
  return { ok: true, message };
}
