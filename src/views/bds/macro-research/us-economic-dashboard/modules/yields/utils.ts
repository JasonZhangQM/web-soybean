/**
 * 美债收益率 - 通用工具函数
 * 服务于 us-economic-dashboard/modules/yields/ 内部，避免跨目录依赖与重复实现
 *
 * 与 economic-dashboard/modules/utils.ts 区别：
 * - 操作类型为 Api.Bds.YieldIndicator（value: number | null，无 value_prev/pub_date 等字段）
 * - 不提供 forwardFill：FRED 数据缺失即缺失，不做填充以保持数据真实性
 */

/**
 * 从 Map 中取某指标最新一条记录（数组已按 report_date 升序，最后一项为最新）
 * 仅返回 value 非 null 的最新记录，避免取到无意义的空值
 */
export function getLatest(
  dataMap: Map<string, Api.Bds.YieldIndicator[]>,
  code: string
): Api.Bds.YieldIndicator | null {
  const list = dataMap.get(code);
  if (!list || !list.length) return null;
  // 从尾部向前找第一条 value 非 null 的记录
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].value != null) return list[i];
  }
  return list[list.length - 1];
}

/**
 * 从 Map 中取某指标时序数组（安全访问，缺失返回空数组）
 */
export function getSeries(
  dataMap: Map<string, Api.Bds.YieldIndicator[]>,
  code: string
): Api.Bds.YieldIndicator[] {
  return dataMap.get(code) ?? [];
}
