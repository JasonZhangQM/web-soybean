declare namespace Api {
  /** 账单模块 */
  namespace Bills {
    /** 账单汇总（对应 GroupOut，共 34 字段） */
    interface Group {
      /** 账户 */
      account: string | null;
      /** 类别 */
      category: string;
      /** 证券代码 */
      symbol: string;
      /** 起始时间 */
      start_time: string;
      /** 结束时间 */
      end_time: string;
      /** 成交笔数 */
      count: number;
      /** 收益试算时间 */
      profit_time: string | null;
      /** 市值试算时间 */
      value_time: string | null;
      /** 多头持仓 */
      p_long: number | null;
      /** 空头持仓 */
      p_short: number | null;
      /** 总持仓 */
      p_total: number | null;
      /** 多头总成本 */
      cost_t_long: number | null;
      /** 空头总成本 */
      cost_t_short: number | null;
      /** 总成本 */
      cost_total: number | null;
      /** 最新价 */
      price: number | null;
      /** 乘数 */
      multiplier: number | null;
      /** 多头市值 */
      value_long: number | null;
      /** 空头市值 */
      value_short: number | null;
      /** 总市值 */
      value_total: number | null;
      /** 多头浮盈 */
      pf_long: number | null;
      /** 空头浮盈 */
      pf_short: number | null;
      /** 总浮盈 */
      pf_total: number | null;
      /** 多头平仓盈亏 */
      pl_t_long: number | null;
      /** 空头平仓盈亏 */
      pl_t_short: number | null;
      /** 总平仓盈亏 */
      pl_total: number | null;
      /** 其他平仓盈亏 */
      pl_t_other: number | null;
      /** 期货平仓盈亏 */
      pl_t_ft: number | null;
      /** 经纪平仓盈亏 */
      pl_t_br: number | null;
      /** 经纪差额 */
      diff_br: number | null;
      /** 资金差额 */
      diff_dw: number | null;
      /** 资金日结差额 */
      diff_dwt: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 交易收益（对应 BillOut，共 41 字段） */
    interface Bill {
      /** 交易时间 */
      trade_time: string;
      /** 证券代码 */
      symbol: string;
      /** 证券名称 */
      name: string;
      /** 交易类别 */
      exec_type: string;
      /** 一级分类 */
      category1: string;
      /** 分类 */
      category: string;
      /** 买卖方向 */
      b_s: string | null;
      /** 类别（买/卖） */
      c_p: string | null;
      /** 开平方向 */
      o_c: string | null;
      /** 成交均价 */
      price: number;
      /** 成交数量 */
      vol: number;
      /** 成交金额 */
      amount: number;
      /** 实际发生金额 */
      amount_act: number;
      /** 余额 */
      balance: number | null;
      /** 税费 */
      fee_tax: number | null;
      /** 手续费 */
      fees: number | null;
      /** 印花税 */
      taxes: number | null;
      /** 过户费 */
      fee_exec1: number | null;
      /** 交易过户费 */
      fee_exec2: number | null;
      /** 行权过户费 */
      fee_exec3: number | null;
      /** 经手费 */
      fee_hand: number | null;
      /** 证管费 */
      fee_sr: number | null;
      /** 清算费 */
      fee_clear: number | null;
      /** 交易规费 */
      fee_reg: number | null;
      /** 其他费用 */
      fee_other: number | null;
      /** 权利金收支 */
      premium: number | null;
      /** 资金余额 */
      cash: number | null;
      /** 成交编号 */
      id_exec: string | null;
      /** 合同编号/流水号 */
      id_agree: string | null;
      /** 币种 */
      currency: string;
      /** 股东账号/资金账号 */
      account_id: string | null;
      /** 交易市场 */
      market: string | null;
      /** 账户 */
      account: string;
      /** 归属标的（经 bills_group_symbol.vm_symbol；资金流水行恒为 null） */
      vm_symbol: string | null;
      /** 「想法」正文（bills_bill_note，成交当时的判断） */
      note_idea: string | null;
      /** 「想法」落笔时间（晚于 trade_time = 事后补写） */
      note_idea_at: string | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 成交笔记（对应 BillNoteOut，bills_bill_note 一行 = 一笔成交的一个 kind） */
    interface BillNote {
      /** 主键 */
      id: number;
      /** 关联账单 ID（账单被删后置 null，靠 biz_key 找回） */
      bill_id: number | null;
      /** 业务指纹（account|trade_time|symbol|exec_type|amount_act|id_agree|cash 的 md5） */
      biz_key: string;
      /** 笔记类型：想法（复盘已上移到标的层，不再挂在成交上） */
      kind: string;
      /** 正文 */
      content: string;
      /** 落笔时间（后端写，前端不可传） */
      content_at: string;
      /** manual=成交当日或次日写；backfill=事后补录（>3 天） */
      source: string;
      /** 执行的剧本 irs_vm_plan.id（裸 ID，无外键；未归因为 null） */
      plan_id: number | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 账单收益（对应 ProfitOut，共 21 字段，末尾 3 字段为关联 Bill 的扁平化字段） */
    interface Profit {
      /** 关联账单 ID */
      bill_id: number;
      /** 多头持仓 */
      p_long: number | null;
      /** 空头持仓 */
      p_short: number | null;
      /** 多头总成本 */
      cost_t_long: number | null;
      /** 空头总成本 */
      cost_t_short: number | null;
      /** 多头单位成本 */
      cost_u_long: number | null;
      /** 空头单位成本 */
      cost_u_short: number | null;
      /** 多头盈亏 */
      pl_long: number | null;
      /** 空头盈亏 */
      pl_short: number | null;
      /** 其他盈亏 */
      pl_other: number | null;
      /** 期货盈亏 */
      pl_ft: number | null;
      /** 经纪盈亏 */
      pl_br: number | null;
      /** 经纪差额 */
      diff_br: number | null;
      /** 资金差额 */
      diff_dw: number | null;
      /** 资金日结差额 */
      diff_dwt: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
      /** 关联账单的账户 */
      account: string | null;
      /** 关联账单的证券代码 */
      symbol: string | null;
      /** 关联账单的证券名称 */
      name: string | null;
      /** 交易时间 */
      trade_time: string | null;
    }

    /** 账户汇总（对应 GroupAccOut，共 16 字段） */
    interface GroupAcc {
      /** 账户 */
      account: string;
      /** 资金账户余额 */
      cash_acc: number | null;
      /** 资金账户浮盈 */
      fm_acc: number | null;
      /** 总成本 */
      cost_total: number | null;
      /** 总市值 */
      value_total: number | null;
      /** 账户价值（未扣融资负债的总资产） */
      acc_aset: number | null;
      /** 总浮盈 */
      pf_total: number | null;
      /** 总盈亏 */
      pl_all: number | null;
      /** 总盈亏率 */
      pfl_all: number | null;
      /** 日盈亏率 */
      pfl_day: number | null;
      /** 经纪差额 */
      diff_br: number | null;
      /** 资金差额 */
      diff_dw: number | null;
      /** 资金日结差额 */
      diff_dwt: number | null;
      /** 状态 */
      status: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 标的汇总（对应 GroupSymbolOut，共 19 字段；笔记与主题列已全部下线） */
    interface GroupSymbol {
      /** 类别 */
      category: string;
      /** 证券代码 */
      symbol: string;
      /** 成交笔数 */
      count: number;
      /** 总持仓 */
      p_total: number | null;
      /** 总成本 */
      cost_total: number | null;
      /** 最新价 */
      price: number | null;
      /** 乘数 */
      multiplier: number | null;
      /** 日市值合计 */
      value_d_total: number | null;
      /** 总市值 */
      value_total: number | null;
      /** 日浮盈合计 */
      pf_d_total: number | null;
      /** 总浮盈 */
      pf_total: number | null;
      /** 总盈亏 */
      pl_all: number | null;
      /** 总盈亏率 */
      pfl_all: number | null;
      /** 经纪差额 */
      diff_br: number | null;
      /** 资金差额 */
      diff_dw: number | null;
      /** 资金日结差额 */
      diff_dwt: number | null;
      /** 归属标的（唯一的人工列，重算不覆盖；融资融券与未归属为 null） */
      vm_symbol: string | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 归属计数（顶部提示「还有多少行没选」；三态之和 = total） */
    interface GroupSymbolCoverage {
      /** 已归属行数（含 vm_symbol 与同代码自动命中） */
      mapped: number;
      /** 真未归属行数（可归属交易行里既无 vm_symbol、也不同代码），即可操作清单 */
      unmapped: number;
      /**
       * 不参与归属行数：资金流水行（RZRQ / CRJ / SYFY / cash + 理财逆回购）。
       * 这些行的 symbol 只是流水占位代码而非证券，挂标的不产生任何归属意义，不是漏配。
       */
      excluded: number;
      /** 总行数 */
      total: number;
    }

    /**
     * 券商码候选（对应 GroupSymbolCodeOut，`GET /bills/group-symbols/symbol-options`）
     *
     * 服务端已按 symbol 去重、剔除资金流水占位码、持仓中的排前面。
     * 唯一消费者是 bds「期权行情同步清单」的券商码内联下拉（跨模块只读调用）。
     */
    interface GroupSymbolCode {
      /** 账单口径代码（如 SHQQ.10012562 / CFFEX.IO2611-P-4000） */
      symbol: string;
      /** 交易分类（期权交易 / 期货交易 / 证券交易） */
      category: string;
      /** 持仓量（跨分类取最大） */
      p_total: number | null;
      /** 当前市值（跨分类求和；非 0 即在持仓中） */
      value_total: number | null;
    }

    /** 年度收益（对应 ProfitYearOut，共 14 字段） */
    interface ProfitYear {
      /** 年度 */
      year: number;
      /** 平仓盈亏l */
      pl_long: number | null;
      /** 平仓盈亏s */
      pl_short: number | null;
      /** 其他损益 */
      pl_other: number | null;
      /** 融资利息 */
      pl_br: number | null;
      /** 总平仓盈亏 */
      pl_all: number | null;
      /** 累计盈亏 */
      pl_cumulative: number | null;
      /** 年初资产 */
      asset_begin: number | null;
      /** 年末资产 */
      asset_end: number | null;
      /** 日均资产 */
      asset_avg: number | null;
      /** 收益率 */
      return_rate: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 同步步骤结果 */
    interface SyncStepResult {
      /** 步骤名 */
      step: string;
      /** 步骤结果 */
      result: any;
    }

    /** 同步结果（{status, steps: [{step, result}]}） */
    interface SyncResult {
      /** 同步状态 */
      status: string;
      /** 各步骤结果 */
      steps: SyncStepResult[];
    }

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

    /** 风险看板完整响应（GET /bills/risk-board） */
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
      /** 情景模式中文名 */
      mode_names: Record<string, string>;
      /** 情景档位（负数=涨幅） */
      steps: number[];
      /** 上行情景档位（负数=涨幅） */
      upside_steps: number[];
      /** 数据降级/兜底提示 */
      warnings: string[];
    }

    /** 风险看板重算结果（POST /bills/run/risk-board） */
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

    /** 剧本盈亏归因-单剧本行（读 bills_bill_note.plan_id，group by 剧本） */
    interface AttributionPlan {
      /** 剧本 irs_vm_plan.id（裸 ID） */
      plan_id: number;
      /** 执行笔数（每笔成交只取一条带 plan_id 的笔记，去重） */
      exec_count: number;
      /** 累计平仓盈亏（正=盈利） */
      total_pl: number;
      /** 盈利笔数（pl > 0） */
      win_count: number;
      /** 胜率 0~1 */
      win_rate: number;
      /** 平均盈亏 */
      avg_pl: number;
      /** 最近一次成交日 */
      last_trade_time: string | null;
    }

    /** 剧本盈亏归因-未归因残差 */
    interface AttributionUnattributed {
      /** 未归因成交笔数 */
      exec_count: number;
      /** 未归因累计平仓盈亏 */
      total_pl: number;
    }

    /** 剧本盈亏归因完整响应（GET /bills/attribution/by-plan） */
    interface AttributionByPlan {
      items: AttributionPlan[];
      unattributed: AttributionUnattributed;
    }
  }
}
