/**
 * LatestTable 配套工具：批量构造最新值行数据
 * 不同图表的指标定义不同，但 latestRows 计算逻辑一致，抽象为通用函数
 */

export interface LatestRow {
  /** 指标名称 */
  name: string;
  /** 与折线/柱状颜色一致的颜色点 */
  color: string;
  /** 已格式化的最新值（如 "52.30 %"） */
  value: string;
  /** 已格式化的日期（如 "2026-07-01"） */
  date: string;
}

interface LatestItem {
  /** 指标 code，用于从 dataMap 取数组 */
  code: string;
  /** 展示名称 */
  name: string;
  /** 颜色点颜色（与图表系列颜色一致） */
  color: string;
  /** 小数位数，默认 2 */
  digits?: number;
  /** 单位后缀（如 "%"、"万户"），默认空字符串 */
  unit?: string;
}

/**
 * 通用：从 Map 中取多个指标的最新值，构造 LatestTable 所需的行数据
 * 仅取 value 非 null 的最新一条记录，避免取到无意义的空值
 *
 * @param dataMap 指标 Map（code -> 升序时序数组）
 * @param items 指标定义列表
 */
export function buildLatestRows<T extends { value: number | string | null; report_date: string }>(
  dataMap: Map<string, T[]>,
  items: LatestItem[]
): LatestRow[] {
  return items.map(c => {
    const arr = (dataMap.get(c.code) ?? []).filter(x => x.value != null);
    const latest = arr.length > 0 ? arr[arr.length - 1] : null;
    const digits = c.digits ?? 2;
    const unit = c.unit ?? '';
    return {
      name: c.name,
      color: c.color,
      value: latest
        ? Number(latest.value).toFixed(digits) + (unit ? ` ${unit}` : '')
        : '--',
      date: latest ? latest.report_date.slice(0, 10) : '--'
    };
  });
}

/**
 * 单系列便捷构造：从已取出的时序数组中取最新值
 * 适用于 props 为 data: T[]（而非 dataMap）的单系列图表组件
 *
 * @param arr 时序数组（升序）
 * @param name 展示名称
 * @param color 颜色点
 * @param unit 单位后缀
 * @param digits 小数位数
 */
export function buildLatestRowFromArray<T extends { value: number | string | null; report_date: string }>(
  arr: T[],
  name: string,
  color: string,
  unit?: string,
  digits?: number
): LatestRow[] {
  const filtered = arr.filter(x => x.value != null);
  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : null;
  const d = digits ?? 2;
  const u = unit ?? '';
  return [
    {
      name,
      color,
      value: latest
        ? Number(latest.value).toFixed(d) + (u ? ` ${u}` : '')
        : '--',
      date: latest ? latest.report_date.slice(0, 10) : '--'
    }
  ];
}
