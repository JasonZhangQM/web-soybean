/**
 * 风险看板格式化工具（页面与子组件共用）。
 *
 * 核心约定：后端的 `drop_pct` 正数=跌幅、负数=涨幅，展示时必须翻转成正负号，
 * 不能把原始负值直接贴到表头，否则用户会把「涨 20%」读成「跌 20%」。
 */
import { h } from 'vue';
import { NTooltip } from 'naive-ui';

/** 列头统一排版：标题 + 问号同行、不折行 */
const HEADER_STYLE = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap';

/**
 * 列头「?」弹窗：圆形图标 + 悬停多行说明。
 * 所有带口径说明的列头共用这一个触发器，避免各处另写一份后样式漂移。
 * lastDim=true 时末行压成灰色小字，用作补充口径。
 */
function helpTip(lines: string[], lastDim = false) {
  return h(
    NTooltip,
    { trigger: 'hover', style: { maxWidth: '360px' } },
    {
      trigger: () =>
        h(
          'span',
          {
            style:
              'cursor:help;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid currentColor;border-radius:50%;font-size:11px;line-height:1;opacity:.6;flex:none'
          },
          '?'
        ),
      default: () =>
        h(
          'div',
          { style: 'line-height:1.6' },
          lines.map((line, i) =>
            h('div', lastDim && i === lines.length - 1 ? { style: 'margin-top:6px;opacity:.8' } : {}, line)
          )
        )
    }
  );
}

/**
 * 两列 Δ 盈亏的列头「?」弹窗：标的监测档位表 / 风险看板逐张合约表共用一份口径文案，
 * 避免两个页面各写一份后漂移。label 只认「即期」「到期」，列名也由它生成。
 * scopeLine 只覆盖末行「统计范围」：默认写标的到档情景（其它持仓冻结），
 * 风险看板逐张合约表按全组情景重估，须传入自己的口径，否则会被读错。
 */
export function deltaPnlHeader(label: string, scopeLine?: string) {
  const isNow = label === '即期';
  return () =>
    h('span', { style: HEADER_STYLE }, [
      `${label}Δ盈亏`,
      helpTip(
        [
          isNow
            ? '即期（BS 重估）：假设标的价格现在就到该档位，期权按 BS 公式重估，保留剩余时间价值。'
            : '到期（内在价值）：假设撑到到期标的就是该档位价，期权按内在价值结算，时间价值归零，是终局下界。',
          isNow
            ? '卖 put 深跌档的亏损通常小于到期列，差额约等于时间价值。'
            : '卖 put 深跌档的亏损通常大于即期列，差额约等于时间价值。',
          scopeLine ??
            '两列都是相对当前的 Δ（V(S1)−V(S0)），只统计该标的项下持仓；其它持仓价格冻结且不随时点重估，两列口径一致。证券/期货两列恒等，差异只来自期权。与「当前盈亏」的账面口径基准不同，不可相加对账。'
        ],
        true
      )
    ]);
}

/** 组合风险指标列头：标题 + 口径说明；文案由调用方按列给，口径与后端 _combo / run() 对齐 */
export function metricHeader(title: string, lines: string[]) {
  return () => h('span', { style: HEADER_STYLE }, [title, helpTip(lines)]);
}

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
export function marginGroupOf(d: { kind: string; mtype?: string | null }): string {
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
