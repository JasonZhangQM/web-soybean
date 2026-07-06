declare namespace Api {
  /** 账单模块 */
  namespace Bills {
    /** 账单汇总（对应 GroupOut，共 33 字段） */
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
      /** 收益日结时间 */
      daily_time: string | null;
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

    /** 交易收益（对应 BillOut，共 36 字段） */
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
      /** 主键 */
      id: number;
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
      /** 账户资产 */
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

    /** 标的汇总（对应 GroupSymbolOut，共 16 字段） */
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
  }
}
