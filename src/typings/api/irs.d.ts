declare namespace Api {
  /** 估值模块 */
  namespace Irs {
    /** 贴水监测（对应 DiscountMonitorOut，共 16 字段，合并配置与监测） */
    interface DiscountMonitor {
      /** 主键 */
      id: number;
      /** 连续合约 */
      symbol_con: string;
      /** 真实合约 */
      symbol: string | null;
      /** 主力 */
      is_main: boolean;
      /** 合约类别 */
      symbol_type: string | null;
      /** 连续合约名称 */
      con_name: string | null;
      /** 标的代码 */
      symbol_ud: string | null;
      /** 到期日 */
      delisted_date: string | null;
      /** 剩余天数 */
      days_left: number | null;
      /** 持仓量 */
      position: number | null;
      /** 合约现价 */
      price: number | null;
      /** 基础现价 */
      price_ud: number | null;
      /** 贴水 */
      discount: number | null;
      /** 贴水率(%) */
      ratio: number | null;
      /** 贴水率(%Y) */
      ratio_y: number | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 同步结果（{status, message}） */
    interface SyncResult {
      /** 同步状态 */
      status: string;
      /** 同步消息 */
      message: string;
    }

    /** 标的监测（对应 UnderlyingMonitorOut，主表 27 字段 + 9 个 v3 派生字段） */
    interface UnderlyingMonitor {
      /** 代码（业务主键，API 禁改） */
      symbol: string;
      /** 名称 */
      name: string | null;
      /** 主题（唯一定义处，跨合约聚合用） */
      theme: string | null;
      /** 估值价-极低 */
      pp_el: number | null;
      /** 估值价-低 */
      pp_l: number | null;
      /** 估值价-中 */
      pp_m: number | null;
      /** 估值价-高 */
      pp_h: number | null;
      /** 估值价-极高 */
      pp_eh: number | null;
      /** 上年末收盘价 */
      py_close: number | null;
      /** 年高 */
      y_high: number | null;
      /** 年低 */
      y_low: number | null;
      /** 最新价 */
      price: number | null;
      /** 年高(%) */
      pv_yh: number | null;
      /** 年低(%) */
      pv_yl: number | null;
      /** 最新(%) */
      pv_yy: number | null;
      /** 极低(%) */
      pv_el: number | null;
      /** 低(%) */
      pv_l: number | null;
      /** 中(%) */
      pv_m: number | null;
      /** 高(%) */
      pv_h: number | null;
      /** 极高(%) */
      pv_eh: number | null;
      /** 极低(y%) */
      pv_el_y: number | null;
      /** 低(y%) */
      pv_l_y: number | null;
      /** 中(y%) */
      pv_m_y: number | null;
      /** 高(y%) */
      pv_h_y: number | null;
      /** 极高(y%) */
      pv_eh_y: number | null;
      /** 派生：当前所处档位区间（带语义：极低~低 / 低~中 …，左闭右开） */
      zone: string | null;
      /** 派生：当前档位对应 PE 分位（pct_10y，仅指数标的有效，其余 null） */
      pe_pct: number | null;
      /** 派生：当前档位对应 PB 分位（pct_10y，仅指数标的有效，其余 null） */
      pb_pct: number | null;
      /** 派生：当前生效档位版本日期 */
      pp_effective_date: string | null;
      /** 派生：档位版本总数 */
      pp_version_count: number | null;
      /** 派生：最早的未来版日期（页面提示「待生效 X-XX」） */
      pp_pending_date: string | null;
      /** 派生：最新研究定稿日 */
      research_date: string | null;
      /** 派生：最新研究结论 */
      research_conclusion: string | null;
      /** 派生：下次复核日 */
      next_review: string | null;
      /** 派生：生效剧本数（未暂停的数量） */
      plan_active: number | null;
      /**
       * 派生：标的项下持仓风险敞口合计（bills_group_symbol 按归属汇总 SUM(risk_exposure)）。
       * 与标的推演 subject_exposure 同源；null = 未设置，列表显示 '-' 且排最后。
       * 列表在后端按该值倒序（分页前 ORDER BY），前端不二次排序。
       */
      risk_exposure: number | null;
      /** 主键（会漂移，关联键一律用 symbol） */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 档位版本（对应 UnderlyingVersionOut）：五档 + 现算 pv_* + 状态 + 与上一版差值 */
    interface UnderlyingVersion {
      id: number;
      symbol: string;
      /** 生效日：`effective_date <= D` 的最大版就是 D 日的档位 */
      effective_date: string;
      note: string | null;
      pp_el: number | null;
      pp_l: number | null;
      pp_m: number | null;
      pp_h: number | null;
      pp_eh: number | null;
      pv_el: number | null;
      pv_l: number | null;
      pv_m: number | null;
      pv_h: number | null;
      pv_eh: number | null;
      pv_el_y: number | null;
      pv_l_y: number | null;
      pv_m_y: number | null;
      pv_h_y: number | null;
      pv_eh_y: number | null;
      /** current = 当前生效 / history = 历史 / pending = 未来日 */
      status: 'current' | 'history' | 'pending';
      /** 是否还有更晚的未来版 */
      pending_next: boolean;
      /** 相对上一版各档位差值（字段名 -> number） */
      diff: Record<string, number>;
      create_time: string;
      update_time: string;
    }

    /** 标的研究（对应 UnderlyingResearchOut，按 research_date 留版） */
    interface UnderlyingResearch {
      id: number;
      symbol: string;
      research_date: string;
      /** 核心论点（≤200 字） */
      thesis: string | null;
      /** 结论（≤200 字） */
      conclusion: string | null;
      /** 最大风险（≤200 字） */
      max_risk: string | null;
      /** 预期差 */
      expectation_gap: string | null;
      /** 前提条件（≤200 字） */
      pre_condition: string | null;
      /** 下次复核日 */
      next_review: string | null;
      /** 研究笔记（知识库链接/编号） */
      research_note: string | null;
      /** 摘要（≤800 字） */
      research_brief: string | null;
      /** 研究过程日志（≤2000 字） */
      research_log: string | null;
      create_time: string;
      update_time: string;
    }

    /** 剧本（对应 UnderlyingPlanOut，用真实合约代码 + 点位；长期有效、可反复执行） */
    interface UnderlyingPlan {
      id: number;
      /** 归属标的（irs_underlying_monitor.symbol） */
      underlying_symbol: string;
      /** 实际下单合约代码 */
      trade_symbol: string;
      /** 序号（同标的同 seq 覆盖） */
      seq: number;
      /** 买 / 卖 */
      b_s: string;
      /** 开 / 平 */
      o_c: string | null;
      /** 触发方向：lte / gte 等 */
      trigger_op: string;
      /** 显式触发价（为空时回落到 trigger_ref 的档位值） */
      trigger_price: number | null;
      /** 引用档位字段：pp_el / pp_l / pp_m / pp_h / pp_eh */
      trigger_ref: string | null;
      trigger_price2: number | null;
      /** 每次执行手数（空=到价再定量） */
      qty: number | null;
      reason: string | null;
      is_cancelled: boolean;
      /** 派生：生效 / 暂停 */
      status: string;
      /** 派生：有效触发价 = trigger_price ?? 当前档位值 */
      effective_trigger: number | null;
      /** 派生：引用档位当前值 */
      trigger_ref_value: number | null;
      create_time: string;
      update_time: string;
    }

    /** 投资逻辑（对应 UnderlyingLogicOut） */
    interface UnderlyingLogic {
      id: number;
      symbol: string;
      seq: number;
      content: string;
      /** 定价依据 */
      pricing: string | null;
      /** 状态：完好 / 减弱 / 破坏（与 models.UnderlyingLogic.STATE_CHOICES 一致） */
      state: string;
      state_at: string | null;
      evidence: string | null;
      create_time: string;
      update_time: string;
    }

    /** 证伪条件（对应 UnderlyingInvalidateOut） */
    interface UnderlyingInvalidate {
      id: number;
      symbol: string;
      logic_id: number | null;
      seq: number;
      /** 命题 */
      proposition: string;
      /** 信号（须可量化） */
      signal: string;
      source: string | null;
      action: string | null;
      /** 判定类别：price / percentile / discount / manual */
      judge: string | null;
      /** 判据表达式（如 price<=3900、pe_pct>=0.8） */
      judge_expr: string | null;
      status: string;
      triggered_at: string | null;
      create_time: string;
      update_time: string;
      /** 派生：signal 里没有数字阈值 -> 前端标红 */
      quantified: boolean;
    }

    /** 归属覆盖率行（每个标的的合约行数与成交笔数） */
    interface UnderlyingCoverageRow {
      symbol: string;
      name: string | null;
      group_rows: number | null;
      bill_rows: number | null;
    }

    /** 未归属合约行 */
    interface UnderlyingUnmappedRow {
      id: number;
      category: string;
      symbol: string;
      count: number | null;
      pf_total: number | null;
      bill_rows: number | null;
    }

    /** 状态变更审计日志行（append-only，复盘回放） */
    interface UnderlyingStateLog {
      id: number;
      /** logic=逻辑；invalidate=证伪 */
      subject_type: 'logic' | 'invalidate';
      subject_id: number;
      symbol: string;
      from_state: string | null;
      to_state: string;
      changed_at: string;
      note: string | null;
    }

    /** 标的级目标仓位（决策层，占总资产比例 %） */
    interface UnderlyingTarget {
      id: number;
      symbol: string;
      target_pct: number | null;
      note: string | null;
    }

    /** 今日页命中的剧本（纯聚合） */
    interface TodayPlanHit {
      seq: number;
      trade_symbol: string;
      b_s: string;
      o_c: string | null;
      reason: string | null;
      effective_trigger: number | null;
    }

    /** 今日页单标的行（GET /irs/today 返回项） */
    interface TodayItem {
      symbol: string;
      name: string | null;
      theme: string | null;
      price: number | null;
      zone: string | null;
      /** 五档价格（UnderlyingMonitor 主表列直传，键为 pp_el~pp_eh） */
      pp: Record<'pp_el' | 'pp_l' | 'pp_m' | 'pp_h' | 'pp_eh', number | null> | null;
      /** 距各档 %（键为 pv_el~pv_eh，负值=档位在现价下方） */
      pv: Record<'pv_el' | 'pv_l' | 'pv_m' | 'pv_h' | 'pv_eh', number | null> | null;
      /** 距最近档位 %（负值=档位在下方） */
      nearest_level_pct: number | null;
      pe_pct: number | null;
      pb_pct: number | null;
      hit_plans: TodayPlanHit[];
      logic_total: number;
      logic_weak: number;
      invalidate_triggered: number;
      has_position: boolean;
      review_due: boolean;
      naked: boolean;
      target_pct: number | null;
      current_pct: number | null;
      drift: number | null;
      priority: number;
    }

    /** 最新分位表单标的行（GET /irs/um-percentile/stats） */
    interface UmPctLatestSubject {
      /** 标的代码（gm 格式） */
      symbol: string;
      /** index / stock */
      subject_type: string;
      /** 锚点：该标的上游估值序列最后一个交易日 */
      as_of: string | null;
      /** PE 10 年分位（0~100，status 非 ok 时为 null） */
      pe_pct_10y: number | null;
      /** PB 10 年分位（0~100） */
      pb_pct_10y: number | null;
      /** ok / loss / no_data */
      status_pe: string;
      status_pb: string;
    }

    /** 最新分位表状态（一标的一行，范围固定=标的监测表） */
    interface UmPctLatestStats {
      /** 表内行数（≤ 监测表标的数） */
      rows: number;
      /** 最近一次刷新时刻 */
      calc_at: string | null;
      /** 表内最老刷新时刻（多标的不同批写入时用于判新鲜度） */
      oldest_calc_at: string | null;
      subjects: UmPctLatestSubject[];
      /** 各标的所属上游估值表末日 */
      source_as_of: Record<string, string | null>;
    }

    // ==================== 风险看板（2026-11-08 自 Api.Bills 迁入） ====================

    /** 风险看板-账户风险卡 */
    interface RiskBoardAccount {
      /** 基准净值（模型盯市修正后） */
      net0: number;
      /** 融资余额 */
      fin: number;
      /** 客户权益 = net0 + 融资 */
      eq: number;
      /** 保证金占用 */
      margin: number;
      /** 真实风险度 = 保证金 / 净资产 */
      real: number | null;
      /** 交易所风险度 = 保证金 / 客户权益 */
      exch: number | null;
      /** 自有资金保证金覆盖率 = 净资产 / 保证金 */
      coverage: number | null;
      /** 是否已触发追保（交易所口径）；账户卡不返回，仅情景行提供 */
      breached?: boolean;
      /** 账户层面全部持仓的账面浮盈（bills_group_acc.pf_total，排除合计） */
      pf_now: number;
      /** 账户风险敞口（bills_group_acc.risk_exposure，人工确认口径，含账户全部持仓）；null = 全部未设置 */
      risk_exposure: number | null;
    }

    /** 风险看板-逐仓持仓 */
    interface RiskBoardPosition {
      /** 账户 */
      acct: string;
      /** 交易代码 */
      symbol: string;
      /** 品种：fut / call / put / sec */
      kind: string;
      /** 情景分组键 */
      und_key: string | null;
      /** 持仓数量 */
      qty: number;
      /** 名义市值 */
      nominal: number;
      /** 最大亏损；null=卖认购理论上行无上限 */
      max_loss: number | null;
      /** 标的变动 1% 的盈亏敏感度 */
      drop1_loss: number;
      /** 当前保证金 */
      margin_now: number;
      /** 当前盈亏：该合约在本账户的账面浮盈（bills_group.pf_total，按账户×合约聚合） */
      pf_now: number;
      /** C=认购 / P=认沽（仅期权） */
      cp: string | null;
      /** long=买方 / short=卖方（仅期权） */
      side: string | null;
      /** 行权价（仅期权） */
      strike: number | null;
      /** 到期日 ISO 字符串（仅期权） */
      expiry: string | null;
      /** 剩余天数（仅期权） */
      days: number | null;
      /** 盯市单价（仅期权） */
      px: number | null;
      /** 隐含波动率（仅期权） */
      sigma: number | null;
      /** delta（仅期权） */
      delta: number | null;
    }

    /** 风险看板-单情景逐仓明细 */
    interface RiskBoardDetail {
      /** 交易代码 */
      name: string;
      /** 账户 */
      acct: string;
      /** 品种：fut / call / put / sec */
      kind: string;
      /** 保证金公式族：cffex / etf / shex */
      mtype: string | null;
      /** 情景分组键 */
      und_key: string | null;
      /** 该情景下的保证金 */
      margin: number;
      /** 该情景下的盈亏（正=亏） */
      loss: number;
      /** 另一时点（now ⇄ expiry）逐仓盈亏（正=亏）；仅 detail=true */
      loss_other: number | null;
    }

    /** 风险看板-单情景 × 账户 */
    interface RiskBoardScenario {
      /** 组合亏损（正=亏，负=盈） */
      loss: number;
      /** 剩余净值 */
      net: number;
      /** 保证金占用 */
      margin: number;
      /** 真实风险度 */
      real: number | null;
      /** 交易所风险度 */
      exch: number | null;
      /** 是否追保 */
      breached: boolean;
      /** 逐仓明细（仅 ALL 行且 detail=true） */
      detail: RiskBoardDetail[] | null;
    }

    /** 风险看板-追保临界点 */
    interface RiskBoardFirstCall {
      /** 账户 */
      account: string;
      /** 临界跌幅；负数=上涨侧触发 */
      drop: number;
      /** down / up / now */
      direction: string;
      /** 临界点剩余净值 */
      net: number | null;
      /** 临界点保证金 */
      margin: number | null;
    }

    /** 单个品种组的额度读数（budget.by_scope） */
    interface BudgetScope {
      /** index_fut / gold / opt_short / etf_short / equity / other */
      scope: string;
      /** 中文名 */
      name: string;
      /** 该组当前保证金占用 */
      margin: number;
      /** 占账户净值比例 */
      pct: number | null;
      /** 上限；null=未设上限（只报不判） */
      cap: number | null;
      /** 额度 = net0 × cap − margin */
      headroom: number | null;
      /** 该组当前每手保证金（组内最大） */
      per_lot: number | null;
      /** 还能开几手 */
      lots: number;
      /** ok / over / unknown */
      status: string;
    }

    /** 账户总闸四档读数 */
    interface BudgetTotal {
      /** 保证金占用上限（0.85） */
      cap: number;
      /** 只留给预设加仓点的一块（0.15） */
      reserve: number;
      /** 日常可开比例 = cap − reserve（0.70） */
      usable: number;
      /** net0 × usable − margin(0) */
      gate_now: number;
      /** 判据：net(+stress) × usable − margin(+stress) */
      gate_stress: number;
      /** 含加仓包的极限，仅展示不参与取 min */
      gate_stress_max: number;
      /** ok / over / block / skip */
      status: string;
    }

    /** 单账户预算卡 */
    interface BudgetAccount {
      net0: number;
      /** 账面净值（acc_aset − diff_br） */
      book_net: number;
      /** net0 − 账面净，非 0 时必须提示（BS 重估差） */
      book_gap: number;
      margin: number;
      total: BudgetTotal;
      by_scope: BudgetScope[];
      /** 取 min 后的可开额度 */
      headroom: number | null;
      /** 取到 min 的约束：品种组名 / total@now / total@stress */
      binding: string;
      /** 可开手数 */
      lots: number;
      /** 额度>0 且够一手才算能开 */
      openable: boolean;
      per_lot_margin: number | null;
      /** block / over / ok / skip */
      verdict: string;
    }

    /** 风险预算块（irs/service/budget.py） */
    interface Budget {
      /** 压力档，0.15 = 标的再跌 15% */
      stress_drop: number;
      /** 固定 sync */
      mode: string;
      accounts: Record<string, BudgetAccount>;
      /** 合约 → {acct, scope}，加仓点查额度用 */
      symbols: Record<string, Record<string, string>>;
      summary: {
        verdict: string;
        judged_accounts: number;
        blocked_accounts: string[];
        headroom_total: number | null;
      };
    }

    /** 风险看板完整响应（GET /irs/risk-board） */
    interface RiskBoard {
      /** 引擎版本 */
      engine_ver: string;
      /** 计算日 */
      calc_date: string;
      /** 期权行情快照日 */
      data_as_of: string | null;
      /** 行情滞后交易日数（0=当日，1=T−1） */
      stale_days: number;
      /** now=即期 / expiry=到期 */
      horizon: string;
      /** IV 冲击倍数 */
      iv_mult: number;
      /** 组合净资产 */
      net_total: number;
      /** 组合保证金 */
      margin_total: number;
      /** 组合真实风险度 */
      real_total: number | null;
      /** 数学最大亏损合计（不含无上限合约） */
      max_exposure: number;
      /** 是否存在理论上行无上限的卖认购 */
      max_exposure_unbounded: boolean;
      /** 组合账面浮盈（ALL 视角 = 各账户之和，已排除合计行） */
      pf_now_total: number;
      /** 组合风险敞口（各账户 bills_group_acc.risk_exposure 之和；全部未设置=null） */
      risk_exposure_total: number | null;
      /** 分账户风险卡 */
      accounts: Record<string, RiskBoardAccount>;
      /** 逐仓明细 */
      positions: RiskBoardPosition[];
      /** [mode][drop_pct][account] */
      grid: Record<string, Record<string, Record<string, RiskBoardScenario>>>;
      /** [mode] 最近追保点 */
      first_call: Record<string, RiskBoardFirstCall | null>;
      /** [mode][account] 追保点 */
      first_call_all: Record<string, Record<string, RiskBoardFirstCall | null>>;
      /** 风险预算与加仓额度 */
      budget: Budget;
      /** 情景模式中文名 */
      mode_names: Record<string, string>;
      /** 情景档位（负数=涨幅） */
      steps: number[];
      /** 上行情景档位（负数=涨幅） */
      upside_steps: number[];
      /** 数据降级/兜底提示 */
      warnings: string[];
    }

    /** 风险看板重算结果（POST /irs/run/risk-board） */
    interface RiskBoardRunResult {
      /** 执行状态 */
      status: string;
      /** 引擎版本 */
      engine_ver: string;
      /** 计算日 */
      calc_date: string;
      /** 写入行数 */
      rows_upserted: number;
      /** 本次停用的过期合约 */
      disabled_contracts: string[];
      /** 组合净资产 */
      net_total: number;
      /** 组合保证金 */
      margin_total: number;
      /** 组合真实风险度 */
      real_total: number | null;
      /** [mode] 最近追保点 */
      first_call: Record<string, RiskBoardFirstCall | null>;
      /** 数据降级/兜底提示 */
      warnings: string[];
    }

    // ============ 标的推演（POST /irs/simulate，2026-11-11） ============
    /** 逐仓情景明细行（全部在仓持仓，含冻结行；Σdelta_pnl 可与 combo.loss 对账） */
    interface SimulatePositionRow {
      acct: string;
      symbol: string | null;
      name: string;
      /** fut / call / put 等（risk_scenario 持仓类型） */
      kind: string;
      cp: string | null;
      strike: number | null;
      qty: number | null;
      mult: number | null;
      /** 归属监测标的代码；null = 未归属到任何标的（与是否改价无关） */
      subject: string | null;
      /** 归属标的名称；未归属时为 null */
      subject_name: string | null;
      /** 是否被本次假设价改价命中（改价行高亮，与 subject 无关） */
      changed: boolean;
      price_now: number | null;
      price_at: number | null;
      /** 跌幅（正=下跌）；0 = 冻结 */
      shift: number;
      /** 账单账面浮盈（静态，不随假设价变化） */
      pf_now: number;
      /** 主时点 Δ 盈亏（= 顶部所选时点，供组合对账） */
      delta_pnl: number;
      /** 即期 Δ 盈亏（BS 重估口径） */
      delta_pnl_now: number;
      /** 到期 Δ 盈亏（内在价值口径） */
      delta_pnl_expiry: number;
      margin_at: number;
      margin_delta: number;
      /** 人工确认风险敞口（bills_group，按账户+合约拆分）；null = 未设置 */
      risk_exposure: number | null;
    }

    /** 分账户风险指标（与档位 Tab 的 LevelScenarioAccount 同构，全部由后端现算） */
    interface SimulateAccount {
      account: string;
      /** 账户层面全部持仓账面浮盈（静态，不随假设价变化） */
      pf_now: number;
      /** 账户风险敞口 = bills_group_acc.risk_exposure（人工静态值，含账户全部持仓）；null = 未设置 */
      risk_exposure: number | null;
      /** 主时点 Δ 盈亏（= 顶部所选时点，供组合对账） */
      delta_pnl: number;
      /** 即期 Δ 盈亏（BS 重估口径） */
      delta_pnl_now: number;
      /** 到期 Δ 盈亏（内在价值口径） */
      delta_pnl_expiry: number;
      /** 到档净值（真实口径分母，扣 diff_br） */
      net_at: number;
      /** 客户权益（交易所口径分母） */
      eq_at: number;
      /** 到档保证金 */
      margin_at: number;
      /** 相对 0% 基准的保证金变化（正=占用增加） */
      margin_delta: number;
      /** 真实风险度 = 保证金 / 净资产 */
      real: number | null;
      /** 交易所风险度 = 保证金 / 客户权益 */
      exch: number | null;
      /** 覆盖率 = 净值 / 保证金；无保证金时为 null */
      coverage: number | null;
      /** 追保只判交易所口径（breached） */
      breached: boolean;
    }

    /** 单标的假设态小结 */
    interface SimulateSubject {
      name: string | null;
      price_now: number;
      price_at: number;
      pct: number;
      zone_now: string | null;
      zone_at: string | null;
      /** 全部未取消剧本在假设价下的命中判定 */
      plans_at: {
        seq: number;
        trade_symbol: string | null;
        b_s: string | null;
        o_c: string | null;
        reason: string | null;
        effective_trigger: number | null;
        hit_at: boolean;
      }[];
      pf_now: number;
      pf_at_level: number;
      delta_pnl: number;
      margin_at: number;
      margin_delta: number;
      positions: SimulatePositionRow[];
      price_basis: Record<string, unknown>;
    }

    /** 组合层读数（combo，与 level-scenario 同构） */
    interface SimulateCombo {
      net_at: number;
      margin_total: number;
      /** 组合真实风险度（保证金/净资产） */
      real: number | null;
      /** 交易所口径（保证金/客户权益） */
      exch: number | null;
      loss: number;
    }

    /** 标的推演响应（POST /irs/simulate） */
    interface SimulateResult {
      as_of: string;
      data_as_of: string | null;
      stale_days: number | null;
      engine_ver: string;
      horizon: string;
      iv_mult: number;
      changed_symbols: string[];
      combo: SimulateCombo;
      /** 0% 基准（overrides 全空时的读数，与 risk-board 同口径，供对照） */
      baseline_combo: SimulateCombo;
      budget: {
        stress_drop: number;
        summary: {
          verdict: string;
          judged_accounts: number;
          blocked_accounts: string[];
          headroom_total: number;
        };
        note: string;
      };
      subjects: Record<string, SimulateSubject>;
      /**
       * 标的项下持仓风险敞口合计（按归属标的汇总逐仓 risk_exposure，NULL=未设置不计入）。
       * 左栏卡片与右栏逐仓明细共用这一份排序依据；静态人工值，不随假设价变化。
       */
      subject_exposure: Record<string, number>;
      position_rows: SimulatePositionRow[];
      /** 分账户风险指标（空账户不展示） */
      accounts: SimulateAccount[];
      warnings: string[];
    }

    // ============ 标的监测抽屉「估值与走势」Tab（2026-11-08） ============
    /** 单指标 3/5/10 年分位（日历对日口径，来自 irs_um_percentile） */
    interface UmMarketPctTriple {
      '3y': number | null;
      '5y': number | null;
      '10y': number | null;
    }

    /** 最新估值分位截面整行：只做展示，前端不重算分位 */
    interface UmMarketPercentile {
      symbol: string;
      /** index / stock */
      subject_type: string;
      as_of: string | null;
      source_as_of: string | null;
      calc_at: string | null;
      first_date: string | null;
      raw_n: number | null;
      status_note: string | null;
      /** 4 指标当前值 */
      current: Record<string, number | null>;
      /** 4 指标 × 3 窗口分位 */
      pct: Record<string, UmMarketPctTriple>;
      /** ok / loss / no_data */
      status: Record<string, string>;
    }

    /** 估值原始值序列（不是分位序列） */
    interface UmMarketValuation {
      dates: string[];
      values: (number | null)[];
      as_of: string | null;
      current: number | null;
    }

    /** 区间收益/回撤摘要，数值与日期全部后端算好 */
    interface UmMarketPerformanceSummary {
      start_date: string | null;
      end_date: string | null;
      cum_return: number | null;
      current_drawdown: number | null;
      max_drawdown: number | null;
      max_dd_peak_date: string | null;
      max_dd_trough_date: string | null;
      max_dd_peak_value: number | null;
      max_dd_trough_value: number | null;
      recovered: boolean;
      recover_date: string | null;
    }

    interface UmMarketPerformance {
      dates: string[];
      cum_return: (number | null)[];
      drawdown: (number | null)[];
      summary: UmMarketPerformanceSummary;
      /** post=个股后复权 / none=指数不复权 */
      adjust: string;
      first_close: number;
      last_close: number;
    }

    /** 无估值/行情标的的降级展示（主表行情字段） */
    interface UmMarketFallback {
      price: number | null;
      py_close: number | null;
      y_high: number | null;
      y_low: number | null;
      ytd_return_pct: number | null;
      to_high_pct: number | null;
      to_low_pct: number | null;
    }

    interface UmMarketFreshness {
      latest_trade_date: string | null;
      percentile_as_of: string | null;
      percentile_source_as_of: string | null;
      valuation_as_of: string | null;
      price_as_of: string | null;
      /** 数据末日落后几个交易日（0=当日、1=T−1），按 bds_trade_date 计数、与风险看板同口径；null=无落表行情 */
      stale_days: number | null;
    }

    /** GET /irs/um-market-stats 响应：四块数据一次返回 */
    interface UmMarketStats {
      symbol: string;
      subject_type: string | null;
      range: string;
      metric: string;
      metric_label: string;
      coverage: { percentile: boolean; valuation: boolean; price: boolean };
      percentile: UmMarketPercentile | null;
      valuation: UmMarketValuation | null;
      performance: UmMarketPerformance | null;
      fallback: UmMarketFallback | null;
      freshness: UmMarketFreshness;
      /** 无数据 / 部分缺失时的人话说明 */
      message: string | null;
    }
  }
}
