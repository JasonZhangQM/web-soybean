/**
 * 风险看板格式化工具（页面与子组件共用）。
 *
 * 核心约定：后端的 `drop_pct` 正数=跌幅、负数=涨幅，展示时必须翻转成正负号，
 * 不能把原始负值直接贴到表头，否则用户会把「涨 20%」读成「跌 20%」。
 */

/** 金额：千分位 + 2 位小数；空值显示 '-' */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 风险度：4 位小数；空值显示 '-' */
export function fmtRatio(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(4);
}

/** 单价/波动率：4 位小数 */
export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(4);
}

/** 情景档位标签：+0.2 → '-20%'，-0.2 → '+20%'，0 → '0%' */
export function scenarioLabel(drop: number): string {
  const pct = Math.round(drop * 10000) / 100;
  if (pct > 0) return `-${pct}%`;
  if (pct < 0) return `+${-pct}%`;
  return '0%';
}

/** 追保点标签：下跌 4.35% / 上涨 12.00% / 当前已追保 */
export function firstCallLabel(fc: Api.Bills.RiskBoardFirstCall | null | undefined): string {
  if (!fc) return '不触发';
  if (fc.direction === 'now') return '当前已追保';
  const pct = Math.abs(fc.drop * 100).toFixed(2);
  return fc.direction === 'up' ? `上涨 ${pct}%` : `下跌 ${pct}%`;
}

/** 风险等级：ok / warn / hot / danger / none（用于统一配色） */
export type RiskLevel = 'ok' | 'warn' | 'hot' | 'danger' | 'none';

/** 真实风险度分档：<0.5 绿 / 0.5~0.8 黄 / 0.8~1 橙 / ≥1 红 */
export function ratioLevel(real: number | null | undefined): RiskLevel {
  if (real === null || real === undefined) return 'none';
  if (real >= 1) return 'danger';
  if (real >= 0.8) return 'hot';
  if (real >= 0.5) return 'warn';
  return 'ok';
}

/** 首个追保跌幅分档：<5% 红 / 5~10% 橙 / ≥10% 绿；已追保直接红 */
export function firstCallLevel(fc: Api.Bills.RiskBoardFirstCall | null | undefined): RiskLevel {
  if (!fc) return 'ok';
  if (fc.direction === 'now') return 'danger';
  const abs = Math.abs(fc.drop);
  if (abs < 0.05) return 'danger';
  if (abs < 0.1) return 'hot';
  return 'ok';
}

/** 等级 → 颜色（与 NaiveUI 主题色一致） */
export function levelColor(level: RiskLevel): string {
  return { ok: '#18a058', warn: '#f0a020', hot: '#ff7d00', danger: '#d03050', none: '#909399' }[level];
}

/** 行情新鲜度分档 */
export function staleLevel(staleDays: number): RiskLevel {
  if (staleDays <= 0) return 'ok';
  if (staleDays === 1) return 'warn';
  return 'danger';
}

/** 行情新鲜度文本 */
export function staleLabel(staleDays: number, dataAsOf: string | null): string {
  const base = staleDays <= 0 ? '当日' : `T−${staleDays}`;
  return dataAsOf ? `${base}（${dataAsOf}）` : base;
}

/** 保证金结构图分组：期货 / 股指期权 / ETF期权 / 商品期权 / 其他 */
export function marginGroupOf(d: Api.Bills.RiskBoardDetail): string {
  if (d.kind === 'fut') return '期货';
  if (d.kind === 'sec') return '其他';
  if (d.mtype === 'cffex') return '股指期权';
  if (d.mtype === 'etf') return 'ETF期权';
  if (d.mtype === 'shex') return '商品期权';
  return '其他';
}
