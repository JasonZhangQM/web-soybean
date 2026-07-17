/**
 * 中国宏观看板 - 衍生值计算与通用工具函数
 * 所有 Tab 子组件共享，避免重复实现
 */

/** 衍生值结果项 */
export interface DerivedItem {
  report_date: string;
  value: number;
}

/**
 * CPI-PPI 剪刀差：按 report_date 对齐，CPI 同比 - PPI 同比
 */
export function calcScissors(
  cpiArr: Api.Bds.EconomicIndicator[],
  ppiArr: Api.Bds.EconomicIndicator[]
): DerivedItem[] {
  const ppiMap = new Map(ppiArr.map(x => [x.report_date, Number(x.value)]));
  return cpiArr
    .filter(x => ppiMap.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      // 保留两位小数，避免浮点精度问题导致图表 tooltip 显示一长串小数
      value: +(Number(x.value) - (ppiMap.get(x.report_date) as number)).toFixed(2)
    }));
}

/**
 * M1-M2 剪刀差：按 report_date 对齐，M1 同比 - M2 同比
 */
export function calcM1M2(
  m1Arr: Api.Bds.EconomicIndicator[],
  m2Arr: Api.Bds.EconomicIndicator[]
): DerivedItem[] {
  const m2Map = new Map(m2Arr.map(x => [x.report_date, Number(x.value)]));
  return m1Arr
    .filter(x => m2Map.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      value: Number(x.value) - (m2Map.get(x.report_date) as number)
    }));
}

/**
 * 贸易顺差（同比增速差）：出口同比 - 进口同比
 * 注：HTML 原型如此，保持一致
 */
export function calcTradeBalance(
  expArr: Api.Bds.EconomicIndicator[],
  impArr: Api.Bds.EconomicIndicator[]
): DerivedItem[] {
  const impMap = new Map(impArr.map(x => [x.report_date, Number(x.value)]));
  return expArr
    .filter(x => impMap.has(x.report_date))
    .map(x => ({
      report_date: x.report_date,
      value: Number(x.value) - (impMap.get(x.report_date) as number)
    }));
}

/**
 * min-max 标准化到 0-100
 * 用于 A 股传导分析 Tab 的双折线对比
 */
export function normalize(arr: number[]): number[] {
  if (!arr.length) return [];
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  if (mn === mx) return arr.map(() => 50);
  return arr.map(v => +(((v - mn) / (mx - mn)) * 100).toFixed(1));
}

/**
 * 前向填充：对升序时序数组中 value 为 null 的记录，用前一个非 null 的 value 补充
 * 不修改原对象，返回新数组。首项若为 null 且前面无非 null 值则保持 null。
 * 用于经济指标未发布（value=None）的时点补值，避免图表出现 0 或断点。
 */
export function forwardFill(list: Api.Bds.EconomicIndicator[]): Api.Bds.EconomicIndicator[] {
  // value 类型定义为 number，但后端 nullable + Pydantic v2 将 Decimal 序列化为 string，
  // 运行时可能为 null/''/number/string，故用 any 兜底以通过类型检查
  let lastValid: any = null;
  return list.map(item => {
    const v: any = item.value;
    if (v != null && v !== '') {
      lastValid = v;
      return item;
    }
    // 当前 value 为空，用前一个非空值填充（创建新对象避免污染原数据）
    return { ...item, value: lastValid };
  });
}

/**
 * 从 Map 中取某指标最新一条记录（数组已按 report_date 升序，最后一项为最新）
 */
export function getLatest(
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>,
  code: string
): Api.Bds.EconomicIndicator | null {
  const list = dataMap.get(code);
  if (!list || !list.length) return null;
  return list[list.length - 1];
}

/**
 * 从 Map 中取某指标时序数组（安全访问，缺失返回空数组）
 */
export function getSeries(
  dataMap: Map<string, Api.Bds.EconomicIndicator[]>,
  code: string
): Api.Bds.EconomicIndicator[] {
  return dataMap.get(code) ?? [];
}

/**
 * 上证指数与宏观指标按日期对齐（最近邻：取指数在该宏观日期之前的最近一条）
 * 用于 A 股传导分析的双轴对比图
 */
export function alignByDate(
  macroDates: string[],
  stockIndex: Api.Bds.IndexHistory[]
): Array<{ date: string; stock: Api.Bds.IndexHistory | null }> {
  if (!stockIndex.length) return macroDates.map(date => ({ date, stock: null }));
  const sortedStock = [...stockIndex].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return macroDates.map(date => {
    // 二分查找：找 trade_date <= date 的最近一条
    let lo = 0;
    let hi = sortedStock.length - 1;
    let result: Api.Bds.IndexHistory | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedStock[mid].trade_date <= date) {
        result = sortedStock[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { date, stock: result };
  });
}
