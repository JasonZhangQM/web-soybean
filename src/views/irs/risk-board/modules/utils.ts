/**
 * 风险看板格式化工具（页面与子组件共用）。
 *
 * 核心约定：后端的 `drop_pct` 正数=跌幅、负数=涨幅，展示时必须翻转成正负号，
 * 不能把原始负值直接贴到表头，否则用户会把「涨 20%」读成「跌 20%」。
 */
import { h } from 'vue';

/** 金额：千分位 + 2 位小数；空值显示 '-' */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 盈亏染色：沿用项目口径「亏红盈绿」；正=盈、负=亏；空值显示 '-'，不伪造 0 */
export function pnl(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return h('span', { style: { color: n < 0 ? '#d03050' : '#18a058' } }, fmtMoney(n));
}

/** 风险度：4 位小数；空值显示 '-' */
export function fmtRatio(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(4);
}

/**
 * 单价/波动率：最多 4 位小数，去掉小数末尾多余的 0（4020.0000 → 4020、3.5000 → 3.5）。
 * 全站价格显示统一走这里；空值显示 '-'。项目内「去尾零」口径一致，勿再各页另写一份。
 */
export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v)
    .toFixed(4)
    .replace(/\.?0+$/, '');
}

/** 情景档位标签：+0.2 → '-20%'，-0.2 → '+20%'，0 → '0%' */
export function scenarioLabel(drop: number): string {
  const pct = Math.round(drop * 10000) / 100;
  if (pct > 0) return `-${pct}%`;
  if (pct < 0) return `+${-pct}%`;
  return '0%';
}

/** 追保点标签：下跌 4.35% / 上涨 12.00% / 当前已追保 */
export function firstCallLabel(fc: Api.Irs.RiskBoardFirstCall | null | undefined): string {
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

/**
 * 真实口径是否已越线（保证金占用 ≥ 自有净值）。
 *
 * 交易所口径含融资，未到 100% 券商不会追保，但真实口径越线意味着
 * 「保证金已经是借来的钱在交」——必须单独提示，否则看板一片绿会误导。
 */
export function realOverLine(real: number | null | undefined): boolean {
  return real !== null && real !== undefined && !Number.isNaN(Number(real)) && Number(real) >= 1;
}

/** 首个追保跌幅分档：<5% 红 / 5~10% 橙 / ≥10% 绿；已追保直接红 */
export function firstCallLevel(fc: Api.Irs.RiskBoardFirstCall | null | undefined): RiskLevel {
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
export function marginGroupOf(d: Api.Irs.RiskBoardDetail): string {
  if (d.kind === 'fut') return '期货';
  if (d.kind === 'sec') return '其他';
  if (d.mtype === 'cffex') return '股指期权';
  if (d.mtype === 'etf') return 'ETF期权';
  if (d.mtype === 'shex') return '商品期权';
  return '其他';
}

/** 金额口语化：|v| ≥ 1 万用「万」，否则原值（额度缺口动辄几十万，原值读不动） */
export function fmtMoneyShort(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return fmtMoney(n);
}

/** 预算约束的人话名：total@stress → 总闸·压力，品种组 → 中文名 */
export function bindingLabel(binding: string | null | undefined, acct: Api.Irs.BudgetAccount | null): string {
  if (!binding) return '-';
  if (binding === 'total@stress') return '总闸·压力(+15%)';
  if (binding === 'total@now') return '总闸·即期';
  const hit = acct?.by_scope.find(s => s.scope === binding);
  return hit ? `${hit.name}额度` : binding;
}

/** 预算判定等级：block 红 / over 橙 / ok 绿 / skip 灰 */
export function verdictLevel(verdict: string | null | undefined): RiskLevel {
  if (verdict === 'block') return 'danger';
  if (verdict === 'over') return 'hot';
  if (verdict === 'ok') return 'ok';
  return 'none';
}

/** 预算判定人话 */
export function verdictLabel(verdict: string | null | undefined, lots: number): string {
  if (verdict === 'skip') return '不判（无保证金持仓）';
  if (verdict === 'block') return '禁开新仓';
  if (lots > 0) return `可开 ${lots} 手`;
  if (verdict === 'over') return '禁开（品种组超限，可减不可加）';
  return '禁开（额度不足一手）';
}
