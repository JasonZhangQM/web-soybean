declare namespace Api {
  /** 估值模块 */
  namespace Irs {
    /** 估值配置（对应 SymbolValueOut，共 25 字段） */
    interface SymbolValue {
      /** 代码 */
      symbol: string;
      /** 名称 */
      name: string | null;
      /** 估值价-极低 */
      pp_el: number | null;
      /** 估值价-低 */
      pp_l: number | null;
      /** 估值价-中（自动计算） */
      pp_m: number | null;
      /** 估值价-高 */
      pp_h: number | null;
      /** 估值价-极高 */
      pp_eh: number | null;
      /** 回撤率 */
      vix: number | null;
      /** 总批次 */
      p_total: number | null;
      /** 首批 */
      p_init: number | null;
      /** 加批次 */
      p_inc: number | null;
      /** 第二批买入量（自动计算） */
      v2: number | null;
      /** 第三批买入量（自动计算） */
      v3: number | null;
      /** 总金额(万)（自动计算） */
      m_tot: number | null;
      /** 首笔金额(万)（自动计算） */
      m_init: number | null;
      /** 买点1（自动计算） */
      bg_p_bid1: number | null;
      /** 买点2（自动计算） */
      bg_p_bid2: number | null;
      /** 买点3（自动计算） */
      bg_p_bid3: number | null;
      /** 上年末收盘价 */
      py_close: number | null;
      /** 近期高点 */
      y_high: number | null;
      /** 近期低点 */
      y_low: number | null;
      /** 最新收盘价 */
      last_close: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 估值指标（对应 SymbolKpiOut，共 20 字段） */
    interface SymbolKpi {
      /** 关联估值配置ID */
      symbol_value_id: number;
      /** 最新涨跌幅(%) */
      last_ratio: number | null;
      /** 区间最大涨幅(%) */
      max_ratio: number | null;
      /** 区间最小跌幅(%) */
      min_ratio: number | null;
      /** ROE(扣非) */
      roe_cut: number | null;
      /** 营收同比(%) */
      inc_oper_yoy: number | null;
      /** 扣非净利同比(%) */
      net_prof_pcom_cut_yoy: number | null;
      /** 销售毛利率(%) */
      sale_gpm: number | null;
      /** 销售净利率(%) */
      sale_npm: number | null;
      /** 资产负债率(%) */
      ast_liab_rate: number | null;
      /** PE(TTM扣非) */
      pe_ttm_cut: number | null;
      /** PE(LYR扣非) */
      pe_lyr_cut: number | null;
      /** PB(LYR) */
      pb_lyr: number | null;
      /** PCF(TTM经营) */
      pcf_ttm_oper: number | null;
      /** PEG(LYR) */
      peg_lyr: number | null;
      /** 股息率(TTM)(%) */
      dy_ttm: number | null;
      /** 股息率(LFY)(%) */
      dy_lfy: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 估值监测（对应 MonitorValueOut，共 12 字段，字段名已由双下划线别名映射为单下划线） */
    interface MonitorValue {
      /** 估值配置代码 */
      symbol_value_symbol: string | null;
      /** 估值价-极低 */
      symbol_value_pp_el: number | null;
      /** 估值价-低 */
      symbol_value_pp_l: number | null;
      /** 估值价-中 */
      symbol_value_pp_m: number | null;
      /** 估值价-高 */
      symbol_value_pp_h: number | null;
      /** 估值价-极高 */
      symbol_value_pp_eh: number | null;
      /** 买点1 */
      symbol_value_bg_p_bid1: number | null;
      /** 买点2 */
      symbol_value_bg_p_bid2: number | null;
      /** 买点3 */
      symbol_value_bg_p_bid3: number | null;
      /** 保留字段（不存在，值为 None） */
      symbol_value_vr: any;
      /** 近期高点 */
      rh: number | null;
      /** 最新价 */
      price: number | null;
    }

    /** 期权配置（对应 SymbolOptionOut，共 11 字段，含标的扁平化字段） */
    interface SymbolOption {
      /** 关联标的ID */
      underlying_id: number;
      /** 行权价 */
      price_strike: number;
      /** 到期日（YYYY-MM-DD） */
      delisted_date: string;
      /** 剩余天数（自动计算） */
      days_left: number | null;
      /** 单点价值（自动计算） */
      value_per: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
      /** 标的代码 */
      underlying_symbol: string | null;
      /** 标的名称 */
      underlying_name: string | null;
      /** 标的乘数 */
      underlying_multiplier: number | null;
    }

    /** 期权监测（对应 MonitorOptionOut，共 21 字段，含期权/标的扁平化字段） */
    interface MonitorOption {
      /** 期权代码 */
      symbol: string;
      /** 关联期权配置ID */
      option_id: number;
      /** 期权类型(call/put) */
      option_type: string;
      /** 标的现价 */
      price_ud: number | null;
      /** 期权现价 */
      price: number | null;
      /** 时间价值（自动计算） */
      value_t: number | null;
      /** 内在价值（自动计算） */
      value_i: number | null;
      /** 平值度(%) */
      atm_i: number | null;
      /** 时间价值占比(%) */
      ratio_t: number | null;
      /** 内在价值占比(%) */
      ratio_i: number | null;
      /** 年化时间占比(%) */
      ratio_t_y: number | null;
      /** 年化内在占比(%) */
      ratio_i_y: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
      /** 行权价 */
      option_price_strike: number | null;
      /** 到期日（YYYY-MM-DD） */
      option_delisted_date: string | null;
      /** 剩余天数 */
      option_days_left: number | null;
      /** 单点价值 */
      option_value_per: number | null;
      /** 标的代码 */
      underlying_symbol: string | null;
      /** 标的名称 */
      underlying_name: string | null;
    }

    /** 期权T型报价（对应 MonitorOptionTOut，共 24 字段，含期权/标的扁平化字段） */
    interface MonitorOptionT {
      /** 关联期权配置ID */
      option_id: number;
      /** 标的现价 */
      price_ud: number | null;
      /** 认购期权现价 */
      price_c: number | null;
      /** 认购时间价值 */
      value_t_c: number | null;
      /** 认购内在价值 */
      value_i_c: number | null;
      /** 认购时间占比(%) */
      ratio_t_c: number | null;
      /** 认购内在占比(%) */
      ratio_i_c: number | null;
      /** 认购年化时间占比(%) */
      ratio_t_y_c: number | null;
      /** 认购年化内在占比(%) */
      ratio_i_y_c: number | null;
      /** 认沽期权现价 */
      price_p: number | null;
      /** 认沽时间价值 */
      value_t_p: number | null;
      /** 认沽内在价值 */
      value_i_p: number | null;
      /** 认沽时间占比(%) */
      ratio_t_p: number | null;
      /** 认沽内在占比(%) */
      ratio_i_p: number | null;
      /** 认沽年化时间占比(%) */
      ratio_t_y_p: number | null;
      /** 认沽年化内在占比(%) */
      ratio_i_y_p: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
      /** 行权价 */
      option_price_strike: number | null;
      /** 到期日（YYYY-MM-DD） */
      option_delisted_date: string | null;
      /** 剩余天数 */
      option_days_left: number | null;
      /** 标的代码 */
      underlying_symbol: string | null;
      /** 标的名称 */
      underlying_name: string | null;
    }

    /** 贴水配置（对应 SymbolDiscountOut，共 9 字段） */
    interface SymbolDiscount {
      /** 连续合约代码 */
      symbol_con: string;
      /** 真实合约代码 */
      symbol: string | null;
      /** 是否主力 */
      is_main: boolean;
      /** 合约类别（自动解析） */
      symbol_type: string | null;
      /** 标的代码 */
      symbol_ud: string | null;
      /** 到期日（YYYY-MM-DD） */
      delisted_date: string | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 贴水监测（对应 MonitorDiscountOut，共 17 字段，含贴水配置扁平化字段） */
    interface MonitorDiscount {
      /** 关联贴水配置ID */
      symbol_real_id: number;
      /** 剩余天数（自动计算） */
      days_left: number | null;
      /** 累计持仓 */
      position: number | null;
      /** 合约现价 */
      price: number;
      /** 基础现价 */
      price_ud: number;
      /** 贴水值（自动计算） */
      discount: number | null;
      /** 贴水率(%) */
      ratio: number | null;
      /** 年化贴水率(%) */
      ratio_y: number | null;
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
      /** 真实合约代码 */
      symbol: string | null;
      /** 是否主力 */
      is_main: boolean | null;
      /** 标的代码 */
      symbol_ud: string | null;
      /** 到期日（YYYY-MM-DD） */
      delisted_date: string | null;
    }

    /** 同步结果（{status, message}） */
    interface SyncResult {
      /** 同步状态 */
      status: string;
      /** 同步消息 */
      message: string;
    }
  }
}
