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
 * 账户总表「当前假设 · 到档」组口径（2026-11-15 列平铺后分组表头消失）。
 * 原挂在两级分组父列上，现由 /risk 的 ① SectionBar 统一出「到档口径说明」问号弹窗，
 * 文案仍只此一份；列平铺后每列的专属口径继续走各自 metricHeader。
 */
export const ACCOUNT_AT_NOTES = [
  '随左栏假设价每次重算；0% 基准（滑块归零）时数值等于现价口径，改价后才分叉。',
  '恒等链：到档净值 = 基线净值 − 模型盯市亏损 → 到档权益 = 到档净值 + 账户融资 → 风险度(R) = 到档保证金 ÷ 净值、风险度(E) = 到档保证金 ÷ 权益；覆盖率(R/E) 分别是两者的倒数。',
  '净值 ≤ 0 即穿仓：R 半边显「穿仓」标签；E 半边按自身口径独立判断（权益 ≤ 0 显「穿仓」，融资撑住时仍显数值）。组合行同理。',
  '组合行 ALL 取 combo / baseline_combo：到档权益、覆盖率 R/E、保证金变化均由后端给，前端不自算（🔒4.13）。',
  'Δ 盈亏为模型盯市增量；「当前盈亏」已补盯市修正、与 Δ 同一价源，故「到期累计盈亏」列可直接把两列相加验算。',
  '「到期累计盈亏」= 本行当前盈亏 + 到期Δ盈亏，覆盖全部品种、不论有无到期日；随假设价变，与所选主时点无关。'
];

/**
 * 「到期累计盈亏」列头口径（2026-11-15 用户定稿，与后端 um_simulate 同式）。
 * 与「到期Δ」并列，直接由本行「当前盈亏」+「到期Δ盈亏」相加；两张总表共用，避免文案漂移。
 */
export const CUM_PNL_NOTES = [
  '= 当前盈亏 + 到期Δ盈亏。覆盖全部在仓品种（证券 / 期货 / 期权），不区分有无到期日或权利金，恒有值。',
  '当前盈亏 = 账单账面浮盈 + 盯市修正（模型盯市市值 − 报表市值），与到期Δ同为结算价 / BS 口径（2026-11-15 统一价源）；静态，不随假设价变化。',
  '到期Δ = 撑到到期、按内在价值结算相对当前盯市的增量；证券/期货即价格变动增量，期权还含时间价值归零，故本列随左栏假设价变化。',
  '与顶部主时点选择无关；同一行三列可直接相加验算，Σ逐仓 = Σ分账户 = 组合行（组合值由后端 combo 给）。',
  '价源统一后本列也等于「到期市值 − 建仓成本」：虚值义务仓到期即全额实收权利金。注意账单页的账面浮盈仍是收盘价口径，与本表「当前盈亏」相差 Σ盯市修正，两者不可直接对账。'
];

/**
 * 「当前盈亏」列头口径（2026-11-15 统一价源后）：两张总表共用。
 * 该列已不是纯账面浮盈，须说明与其相加的 Δ 同源，否则容易被当成两套口径。
 */
export const PF_NOW_NOTES = [
  '= 账单账面浮盈 + 盯市修正（模型盯市市值 − 报表市值）。模型盯市按结算价 settle→price，报表按收盘价 price→settle，商品期权两者常不等。',
  '盯市修正与净值 _net0 修正、Δ 盈亏基线 v0 完全同源 ⇒ 本列可与「到期Δ」直接相加，累计列等于「到期市值 − 建仓成本」。',
  '静态值，不随左栏假设价或顶部主时点变化；证券 / 期货两条链本就同源，修正恒 0。',
  '⚠️ 账单页的账面浮盈仍是收盘价口径，与本列相差 Σ盯市修正，不可直接对账。'
];

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
 * 穿仓判据（2026-11-13）：真实风险度 = 保证金 ÷ 净值，净值为负时该值为负、分母非正
 * ⇒ 风险度失去意义，显示「穿仓」而不是一个负数或平淡的 '-'。
 * 后端 run() 在净值 ≤ 0 时把 real 置 null（不编造负数），故还需用
 * 「净值 ≤ 0 且有保证金占用」兜住 null 的情形；空账户（净值 0、保证金 0）不算穿仓。
 * 账户总表（现价 / 到档两组）与档位压力表共用同一判据，各自传自己的净值与保证金。
 */
export function isBusted(
  real: number | null | undefined,
  net: number | null | undefined,
  margin: number | null | undefined
): boolean {
  if (typeof real === 'number' && !Number.isNaN(Number(real)) && Number(real) < 0) return true;
  if (net === null || net === undefined || margin === null || margin === undefined) return false;
  const n = Number(net);
  const m = Number(margin);
  return !Number.isNaN(n) && !Number.isNaN(m) && n <= 0 && m > 0;
}

/** 「穿仓」文字标签：h() 创建的 VNode 拿不到 <style scoped> 属性 ⇒ 样式全部内联 */
export function bustedTag() {
  return h(
    'span',
    {
      style: {
        display: 'inline-block',
        padding: '0 4px',
        borderRadius: '3px',
        background: 'rgba(208, 48, 80, .12)',
        color: '#d03050',
        fontWeight: 600,
        fontSize: '12px'
      }
    },
    '穿仓'
  );
}

/** R/E 分隔符：内联样式保证生效（scoped 样式加不到 h() 生成的节点上） */
function sepNode() {
  return h('span', { style: { margin: '0 2px', color: '#c0c4cc' } }, '/');
}

/**
 * 风险度 R/E 并列（账户总表到档组、档位压力表共用）：
 * R 真实着色（预警用真实）、E 交易所着色，各自空值显示 '-'。
 * 穿仓标志按**各自口径独立判断**（2026-11-15 二次调整）：
 * - R 半边：busted（到档净值 ≤ 0 且有保证金占用）或值为负 ⇒ 显「穿仓」标签；
 * - E 半边：值为负，或权益 ≤ 0（后端把 exch 置 null 且账户已判穿仓）⇒ 显「穿仓」标签；
 *   融资撑住权益（eq > 0）时 E 仍显示数值 —— 两半边各判各的，互不顶替。
 */
export function ratioPair(real: number | null | undefined, exch: number | null | undefined, busted = false) {
  const realBusted = busted || (typeof real === 'number' && Number(real) < 0);
  const exchBusted =
    (typeof exch === 'number' && Number(exch) < 0) || ((exch === null || exch === undefined) && busted);
  return h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, [
    realBusted ? bustedTag() : h('span', { style: { color: levelColor(ratioLevel(real)) } }, fmtRatio(real)),
    sepNode(),
    exchBusted ? bustedTag() : h('span', { style: { color: levelColor(ratioLevel(exch)) } }, fmtRatio(exch))
  ]);
}

/** 覆盖率配色：覆盖率与风险度互为倒数，用 1/c 复用同一套等级阈值；c ≤ 0 直接最红 */
function coverageColor(c: number | null | undefined): string {
  if (c === null || c === undefined || Number.isNaN(Number(c))) return levelColor('none');
  const n = Number(c);
  return levelColor(n > 0 ? ratioLevel(1 / n) : 'danger');
}

/** 覆盖率 R/E 并列：与风险度列同版式；两个值都由后端给，前端不自算（🔒4.13） */
export function coveragePair(realCov: number | null | undefined, exchCov: number | null | undefined) {
  return h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, [
    h('span', { style: { color: coverageColor(realCov) } }, fmtRatio(realCov)),
    sepNode(),
    h('span', { style: { color: coverageColor(exchCov) } }, fmtRatio(exchCov))
  ]);
}

/** 保证金变化：占用增加染红、减少染绿，显示带符号原值（后端无基准时显示 '—'） */
export function marginDelta(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return h('span', { style: { color: n > 0 ? '#d03050' : '#18a058' } }, `${n > 0 ? '+' : ''}${fmtMoney(n)}`);
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

/** 预算约束的人话名（2026-11-16 双防线低R/极低E）：r/e → 防线名，品种组 → 中文名 */
export function bindingLabel(binding: string | null | undefined, acct?: Api.Irs.BudgetAccount | null): string {
  if (!binding) return '-';
  if (binding === 'r') return '低档防线(R)';
  if (binding === 'e') return '极低档防线(E)';
  const hit = acct?.by_scope.find(s => s.scope === binding);
  return hit ? `${hit.name}额度` : binding;
}

/** 预算判定等级：breach 红 / over 橙 / ok 绿 / skip 灰（旧 block 已随 gate 下线） */
export function verdictLevel(verdict: string | null | undefined): RiskLevel {
  if (verdict === 'breach') return 'danger';
  if (verdict === 'over') return 'hot';
  if (verdict === 'ok') return 'ok';
  return 'none';
}
