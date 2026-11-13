/**
 * 风险总览（/risk）左栏标的行的归一化结构（2026-11-13）
 *
 * 今日待办页与 GET /irs/today 一并下线后，左栏改吃 GET /irs/underlying-monitors：
 * 那张表把五档价 / 距档 % 存成扁平字符串列（pp_el…pp_eh、pv_el…pv_eh），
 * 而卡片与刻度条要的是 Number 化的嵌套对象 ⇒ 在 load() 里一次性归一化，
 * 下游（滑块轴域、marks、批量套档、卡片、刻度条）只认这个结构，不再各转一遍。
 *
 * 档位键统一用短名 el/l/m/h/eh：pp 与 pv 两张映射同构，刻度条与滑块只换前缀，
 * 不再出现 "pp_el / pv_el" 两套键名各转一遍的写法。
 *
 * raw 保留整行：点标的开档案抽屉时直接当骨架，省掉一次按 symbol 的二次查询。
 */
export type TierBand = 'el' | 'l' | 'm' | 'h' | 'eh';

/** 五档映射：任一档缺值即整体判无效（null），不让半套档位进刻度条 */
export type TierMap = Record<TierBand, number | null>;

export const TIER_BANDS: TierBand[] = ['el', 'l', 'm', 'h', 'eh'];

/** 档位中文名，与刻度条 / 压力表口径一致（极低→极高） */
export const TIER_NAMES: Record<TierBand, string> = {
  el: '极低',
  l: '低',
  m: '中',
  h: '高',
  eh: '极高'
};

export interface SubjectRow {
  symbol: string;
  name: string | null;
  /** 现价（um.price） */
  price: number | null;
  /** 档位带（主表 zone，如「低~中」） */
  zone: string | null;
  /** PE / PB 10 年分位（0~100） */
  pe_pct: number | null;
  pb_pct: number | null;
  /** 五档价；不全为 null */
  pp: TierMap | null;
  /** 距各档 %；不全为 null */
  pv: TierMap | null;
  /** 原始监测行：开抽屉 / 编辑等需要完整字段时用 */
  raw: Api.Irs.UnderlyingMonitor;
}

/** 字符串 / null 一律转成有限数字，失败给 null（um 表五档列是 varchar） */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 把扁平列（pp_el… / pv_el…）收成 TierMap；缺任意一档即返回 null */
function tierMap(row: Api.Irs.UnderlyingMonitor, prefix: 'pp' | 'pv'): TierMap | null {
  const src = row as unknown as Record<string, unknown>;
  const out = {} as TierMap;
  for (const b of TIER_BANDS) {
    const v = numOrNull(src[`${prefix}_${b}`]);
    if (v === null) return null;
    out[b] = v;
  }
  return out;
}

/** 监测行 → 左栏行；pp/pv 不全时为 null（卡片回退旧文案、滑块退化成现价 ±30%） */
export function toSubjectRow(row: Api.Irs.UnderlyingMonitor): SubjectRow {
  return {
    symbol: row.symbol,
    name: row.name ?? null,
    price: numOrNull(row.price),
    zone: row.zone ?? null,
    pe_pct: numOrNull(row.pe_pct),
    pb_pct: numOrNull(row.pb_pct),
    pp: tierMap(row, 'pp'),
    pv: tierMap(row, 'pv'),
    raw: row
  };
}
