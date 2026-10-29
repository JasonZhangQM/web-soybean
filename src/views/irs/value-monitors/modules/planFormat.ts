/**
 * 剧本的显示口径 —— 「剧本与成交」Tab 与「概览」Tab 共用。
 *
 * 为什么单独抽出来：触发条件的文案（「随档位『低』现 3.62」）一旦两处各写一套，
 * 迟早有一处改了另一处忘改，同一份数据在两个 Tab 里读出两种意思。
 */
/** 档位引用字段的中文名 */
export const REF_LABEL: Record<string, string> = {
  pp_el: '极低',
  pp_l: '低',
  pp_m: '中',
  pp_h: '高',
  pp_eh: '极高'
};

/** 触发方向符号 */
export const OP_LABEL: Record<string, string> = { lte: '≤', gte: '≥' };

/** 剧本状态 → NTag type。状态是后端派生的（生效 / 暂停），前端不另算 */
export const STATUS_TYPE: Record<string, 'warning' | 'success' | 'default' | 'error'> = {
  生效: 'success',
  暂停: 'default'
};

/** 去尾零的数值显示（档位值可能是 3.6200 这种） */
export function fmtPlanNum(v: number | string | null | undefined) {
  if (v == null || v === '') return '—';
  return String(
    Number(v)
      .toFixed(4)
      .replace(/\.?0+$/, '')
  );
}

/**
 * 有效触发价的说明文案：显式价 / 引用档位。
 * 有效值由后端算好放在 `effective_trigger`，前端只显示不重算。
 */
export function triggerText(p: Api.Irs.VmPlan): string {
  const op = OP_LABEL[p.trigger_op] ?? p.trigger_op;
  const eff = fmtPlanNum(p.effective_trigger);
  if (p.trigger_price != null) return `${op} ${eff}（写死）`;
  if (p.trigger_ref) {
    return `${op} ${eff}（随档位「${REF_LABEL[p.trigger_ref] ?? p.trigger_ref}」现 ${fmtPlanNum(p.trigger_ref_value)}）`;
  }
  return `${op} —`;
}
