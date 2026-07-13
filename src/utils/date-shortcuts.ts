/**
 * NDatePicker 日期快捷选项共享常量
 *
 * 适用 type="date" 单日期选择器，函数返回时间戳。
 * 符合 AGENTS.md 规范：今年、近一月、近一季、近一年、近三年、近五年、近十年。
 */
export const dateShortcuts: Record<string, () => number> = {
  今年: () => new Date(new Date().getFullYear(), 0, 1).getTime(),
  近一月: () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getTime();
  },
  近一季: () => {
    // 一季按 3 个月计算
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.getTime();
  },
  近一年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  },
  近三年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.getTime();
  },
  近五年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.getTime();
  },
  近十年: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.getTime();
  }
};
