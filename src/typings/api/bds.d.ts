declare namespace Api {
  /** 基础数据模块 */
  namespace Bds {
    /** 指数代码项（用于下拉选项） */
    interface IndexCodeItem {
      /** 指数代码（如 SHSE.000001） */
      code: string;
      /** 指数名称（如 上证指数） */
      sec_name: string;
    }

    /** 交易日历 */
    interface TradeDate {
      /** 主键 */
      id: number;
      /** 交易日（YYYY-MM-DD） */
      trade_date: string;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 证券信息 */
    interface SymbolInfo {
      /** 主键 */
      id: number;
      /** 代码 */
      symbol: string;
      /** 名称 */
      name: string;
      /** 所属行业 */
      industry: string | null;
      /** 上市日期（YYYY-MM-DD） */
      online_date: string | null;
      /** 最新价 */
      price: number | null;
      /** 涨幅(%) */
      rate: number | null;
      /** PE(静) */
      pe_lyr: number | null;
      /** PE(TTM) */
      pe_ttm: number | null;
      /** PB */
      pb: number | null;
      /** 股息(TTM%) */
      dy_ttm: number | null;
      /** ROE(%) */
      roe: number | null;
      /** 总收入(%) */
      yoy_in: number | null;
      /** 净利润(%) */
      yoy_np: number | null;
      /** 毛利率(%) */
      gpm: number | null;
      /** 负债率(%) */
      dar: number | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 指数历史行情 */
    interface IndexHistory {
      /** 主键 */
      id: number;
      /** 代码 */
      symbol: string;
      /** 交易日期（YYYY-MM-DD） */
      trade_date: string;
      /** 开盘价 */
      open: number | null;
      /** 最高价 */
      high: number | null;
      /** 最低价 */
      low: number | null;
      /** 收盘价 */
      close: number | null;
      /** 成交额 */
      amount: number | null;
      /** 成交量 */
      volume: number | null;
      /** 持仓量 */
      position: number | null;
      /** 指数名称（从 Config.INDEX_CODE 查找，不存数据库） */
      sec_name: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 指数成分股 */
    interface IndexConstituent {
      /** 指数代码 */
      index_code: string;
      /** 成分股代码 */
      symbol: string;
      /** 权重 */
      weight: number | null;
      /** 交易日期（YYYY-MM-DD） */
      trade_date: string;
      /** 指数名称 */
      sec_name: string | null;
    }

    /** 指数成分股查询参数 */
    interface IndexConstituentQueryParams {
      /** 指数代码（多选精确匹配） */
      index_code?: string[];
      /** 成分股代码（模糊匹配） */
      symbol?: string;
      /** 交易日期（YYYY-MM-DD，精确匹配） */
      trade_date?: string;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 指数累计收益率 */
    interface IndexCumReturn {
      /** 交易日列表（YYYY-MM-DD 格式，升序） */
      trade_dates: string[];
      /** 各指数累计收益率序列，key 为指数名称，value 为累计收益率列表（%），NaN 为 null */
      series: Record<string, (number | null)[]>;
      /** 各指数每日最大回撤序列，key 为指数名称，value 为最大回撤列表（%，≤0），NaN 为 null */
      max_drawdown: Record<string, (number | null)[]>;
      /** 实时行情数据源标识（'gm' / 'yfinance' / 'mixed' / null） */
      realtime_source?: string | null;
    }

    /** 同步结果（{status, message}） */
    interface SyncResult {
      /** 同步状态 */
      status: string;
      /** 同步消息 */
      message: string;
      /** 成功更新的指数代码数量（index-history 同步时返回） */
      updated_count?: number;
    }

    /** 资产负债表 */
    interface FundBalance {
      /** 主键 */
      id: number;
      /** 股票代码 */
      symbol: string;
      /** 发布日期 */
      pub_date: string | null;
      /** 报告日期 */
      rpt_date: string | null;
      /** 报表类型 */
      rpt_type: number | null;
      /** 数据类型 */
      data_type: number | null;
      /** 货币资金 */
      mny_cptl: string | null;
      /** 应收账款 */
      acct_rcv: string | null;
      /** 存货 */
      invt: string | null;
      /** 流动资产合计 */
      ttl_cur_ast: string | null;
      /** 固定资产 */
      fix_ast: string | null;
      /** 长期股权投资 */
      lt_eqy_inv: string | null;
      /** 无形资产 */
      intg_ast: string | null;
      /** 商誉 */
      gw: string | null;
      /** 非流动资产合计 */
      ttl_ncur_ast: string | null;
      /** 资产总计 */
      ttl_ast: string | null;
      /** 短期借款 */
      sht_ln: string | null;
      /** 应付账款 */
      acct_pay: string | null;
      /** 流动负债合计 */
      ttl_cur_liab: string | null;
      /** 长期借款 */
      lt_ln: string | null;
      /** 非流动负债合计 */
      ttl_ncur_liab: string | null;
      /** 负债合计 */
      ttl_liab: string | null;
      /** 资本公积 */
      cptl_rsv: string | null;
      /** 未分配利润 */
      ret_prof: string | null;
      /** 归母股东权益合计 */
      ttl_eqy_pcom: string | null;
      /** 股东权益合计 */
      ttl_eqy: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 资产负债表查询参数 */
    interface FundBalanceQueryParams {
      /** 股票代码（模糊匹配） */
      symbol?: string;
      /** 报表类型 */
      rpt_type?: number;
      /** 报告日期起始日 */
      start_date?: string;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 利润表 */
    interface FundIncome {
      /** 主键 */
      id: number;
      /** 股票代码 */
      symbol: string;
      /** 发布日期 */
      pub_date: string | null;
      /** 报告日期 */
      rpt_date: string | null;
      /** 报表类型 */
      rpt_type: number | null;
      /** 数据类型 */
      data_type: number | null;
      /** 营业总收入 */
      ttl_inc_oper: string | null;
      /** 营业收入 */
      inc_oper: string | null;
      /** 营业总成本 */
      ttl_cost_oper: string | null;
      /** 营业成本 */
      cost_oper: string | null;
      /** 销售费用 */
      exp_sell: string | null;
      /** 管理费用 */
      exp_adm: string | null;
      /** 研发费用 */
      exp_rd: string | null;
      /** 财务费用 */
      exp_fin: string | null;
      /** 投资收益 */
      inc_inv: string | null;
      /** 公允价值变动 */
      inc_fv_chg: string | null;
      /** 营业利润 */
      oper_prof: string | null;
      /** 利润总额 */
      ttl_prof: string | null;
      /** 所得税费用 */
      inc_tax: string | null;
      /** 净利润 */
      net_prof: string | null;
      /** 归母净利润 */
      net_prof_pcom: string | null;
      /** 基本每股收益 */
      eps_base: string | null;
      /** 稀释每股收益 */
      eps_dil: string | null;
      /** 营业外收入 */
      inc_noper: string | null;
      /** 营业外支出 */
      exp_noper: string | null;
      /** 综合收益总额 */
      ttl_comp_inc: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 利润表查询参数 */
    interface FundIncomeQueryParams {
      /** 股票代码（模糊匹配） */
      symbol?: string;
      /** 报表类型 */
      rpt_type?: number;
      /** 报告日期起始日 */
      start_date?: string;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 现金流量表 */
    interface FundCashflow {
      /** 主键 */
      id: number;
      /** 股票代码 */
      symbol: string;
      /** 发布日期 */
      pub_date: string | null;
      /** 报告日期 */
      rpt_date: string | null;
      /** 报表类型 */
      rpt_type: number | null;
      /** 数据类型 */
      data_type: number | null;
      /** 销售商品、提供劳务收到的现金 */
      cash_rcv_sale: string | null;
      /** 经营活动现金流入小计 */
      cf_in_oper: string | null;
      /** 购买商品、接受劳务支付的现金 */
      cash_pur_gds_svc: string | null;
      /** 支付给职工以及为职工支付的现金 */
      cash_pay_emp: string | null;
      /** 支付的各项税费 */
      cash_pay_tax: string | null;
      /** 经营活动现金流出小计 */
      cf_out_oper: string | null;
      /** 经营活动产生的现金流量净额 */
      net_cf_oper: string | null;
      /** 收回投资收到的现金 */
      cash_rcv_sale_inv: string | null;
      /** 投资活动现金流入小计 */
      cf_in_inv: string | null;
      /** 购建固定资产、无形资产和其他长期资产支付的现金 */
      pur_fix_intg_ast: string | null;
      /** 投资活动产生的现金流量净额 */
      net_cf_inv: string | null;
      /** 取得借款收到的现金 */
      brw_rcv: string | null;
      /** 筹资活动现金流入小计 */
      cf_in_fin: string | null;
      /** 偿还债务支付的现金 */
      cash_rpay_brw: string | null;
      /** 筹资活动产生的现金流量净额 */
      net_cf_fin: string | null;
      /** 净利润 */
      net_prof: string | null;
      /** 汇率变动对现金及现金等价物的影响 */
      efct_er_chg_cash: string | null;
      /** 现金及现金等价物净增加额 */
      net_incr_cash_eq: string | null;
      /** 期初现金及现金等价物余额 */
      cash_cash_eq_bgn: string | null;
      /** 期末现金及现金等价物余额 */
      cash_cash_eq_end: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 现金流量表查询参数 */
    interface FundCashflowQueryParams {
      /** 股票代码（模糊匹配） */
      symbol?: string;
      /** 报表类型 */
      rpt_type?: number;
      /** 报告日期起始日 */
      start_date?: string;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 财务指标 */
    interface FinanceDeriv {
      /** 股票代码 */
      symbol: string;
      /** 发布日期 */
      pub_date: string;
      /** 报告日期 */
      rpt_date: string;
      /** 报表类型 */
      rpt_type: number;
      /** 数据类型 */
      data_type: number;
      /** 净资产收益率ROE(摊薄) */
      roe: number | null;
      /** 净资产收益率ROE(加权) */
      roe_weight: number | null;
      /** 净资产收益率ROE(平均) */
      roe_avg: number | null;
      /** 总资产报酬率ROA */
      roa: number | null;
      /** 投入资本回报率ROIC */
      roic: number | null;
      /** 销售毛利率 */
      sale_gpm: number | null;
      /** 销售净利率 */
      sale_npm: number | null;
      /** EBITDA/营业总收入 */
      ebitda_toi: number | null;
      /** 息税前利润/营业总收入 */
      ebit_toi: number | null;
      /** 资产负债率 */
      ast_liab_rate: number | null;
      /** 流动比率 */
      curr_rate: number | null;
      /** 速动比率 */
      quick_rate: number | null;
      /** 产权比率 */
      liab_eqy_rate: number | null;
      /** 总资产周转率 */
      ttl_ast_turnover_rate: number | null;
      /** 应收账款周转天数(含应收票据) */
      acct_rcv_turnover_days: number | null;
      /** 存货周转天数 */
      inv_turnover_days: number | null;
      /** 归属母公司股东的净利润同比增长率 */
      net_prof_pcom_yoy: number | null;
      /** 营业总收入同比增长率 */
      ttl_inc_oper_yoy: number | null;
      /** 净利润同比增长率 */
      net_prof_yoy: number | null;
      /** 总资产同比增长率 */
      ttl_asset_yoy: number | null;
    }

    /** 财务指标查询参数 */
    interface FinanceDerivQueryParams {
      /** 股票代码（模糊匹配） */
      symbol?: string | null;
      /** 报表类型 */
      rpt_type?: number | null;
      /** 报告日期起始日 */
      start_date?: string | null;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 估值指标 */
    interface DailyValuation {
      /** 股票代码 */
      symbol: string;
      /** 交易日期 */
      trade_date: string;
      /** 市盈率(TTM) */
      pe_ttm: number | null;
      /** 市盈率(最新年报LYR) */
      pe_lyr: number | null;
      /** 市盈率(最新报告期MRQ) */
      pe_mrq: number | null;
      /** 市盈率(TTM)扣除非经常性损益 */
      pe_ttm_cut: number | null;
      /** 市盈率(最新年报LYR)扣除非经常性损益 */
      pe_lyr_cut: number | null;
      /** 市盈率(最新报告期MRQ)扣除非经常性损益 */
      pe_mrq_cut: number | null;
      /** 市净率(最新年报LYR) */
      pb_lyr: number | null;
      /** 市净率(最新报告期MRQ) */
      pb_mrq: number | null;
      /** 市现率(经营现金流,TTM) */
      pcf_ttm_oper: number | null;
      /** 市现率(现金净流量,TTM) */
      pcf_ttm_ncf: number | null;
      /** 市现率(经营现金流,最新年报LYR) */
      pcf_lyr_oper: number | null;
      /** 市现率(现金净流量,最新年报LYR) */
      pcf_lyr_ncf: number | null;
      /** 市销率(TTM) */
      ps_ttm: number | null;
      /** 市销率(最新年报LYR) */
      ps_lyr: number | null;
      /** 市销率(最新报告期MRQ) */
      ps_mrq: number | null;
      /** 历史PEG值(当年年报增长率) */
      peg_lyr: number | null;
      /** 历史PEG值(当年1季*4较上年年报增长率) */
      peg_1q: number | null;
      /** 历史PEG值(当年3季*4/3较上年年报增长率) */
      peg_3q: number | null;
      /** 股息率(滚动12月TTM) */
      dy_ttm: number | null;
      /** 股息率(上一财年LFY) */
      dy_lfy: number | null;
    }

    /** 估值指标查询参数 */
    interface DailyValuationQueryParams {
      /** 股票代码（模糊匹配） */
      symbol?: string | null;
      /** 交易日期起始日 */
      start_date?: string | null;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 经济指标数据 */
    interface EconomicIndicator {
      /** 主键 */
      id: number;
      /** 指标代码 */
      indicator_code: string;
      /** 指标名称 */
      indicator_name: string;
      /** 指标简称 */
      indicator_short_name: string | null;
      /** 类别 */
      category: string;
      /** 国别 */
      country: string;
      /** 报告日期 */
      report_date: string;
      /** 发布日期 */
      pub_date: string | null;
      /** 数值 */
      value: number;
      /** 前值 */
      value_prev: number | null;
      /** 预期值 */
      value_expected: number | null;
      /** 重要性 */
      importance: number | null;
      /** 修正值 */
      revised: number | null;
      /** 标题 */
      title: string | null;
      /** 前瞻 */
      foresight: string | null;
      /** 单位 */
      unit: string | null;
      /** 频率 */
      frequency: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 经济指标查询参数 */
    interface EconomicIndicatorQueryParams {
      /** 指标代码（精确匹配） */
      indicator_code?: string | null;
      /** 类别（精确匹配） */
      category?: string | null;
      /** 国别（精确匹配） */
      country?: string | null;
      /** 报告日期起始日 */
      start_date?: string | null;
      /** 报告日期结束日 */
      end_date?: string | null;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 经济指标代码 */
    interface EconomicIndicatorCode {
      /** 指标代码 */
      indicator_code: string;
      /** 指标名称 */
      indicator_name: string;
      /** 指标简称 */
      indicator_short_name: string;
      /** 类别 */
      category: string;
      /** 国别 */
      country: string;
      /** 单位 */
      unit: string | null;
      /** 频率 */
      frequency: string | null;
    }

    /** 黄金储备数据 */
    interface GoldReserve {
      /** 主键 */
      id: number;
      /** 国家代码 */
      country_code: string;
      /** 国家名称 */
      country_name: string;
      /** 报告日期 */
      rpt_date: string;
      /** 黄金储备(USD) */
      gold_holdings_usd: number | null;
      /** 单位 */
      unit: string | null;
      /** 频率 */
      frequency: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 黄金储备查询参数 */
    interface GoldReserveQueryParams {
      /** 国家代码（多选精确匹配） */
      country_code?: string[] | null;
      /** 开始日期 YYYY-MM-DD */
      start_date?: string | null;
      /** 结束日期 YYYY-MM-DD */
      end_date?: string | null;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 黄金储备国家 */
    interface GoldReserveCountry {
      /** 国家代码 */
      country_code: string;
      /** 国家名称 */
      country_name: string;
      /** IMF ISO2 代码 */
      imf_code: string;
    }

    /** 美债收益率指标数据（对应 bds_yield_indicator 表，数据源 FRED API series/observations） */
    interface YieldIndicator {
      /** 主键 */
      id: number;
      /** 指标代码 */
      indicator_code: string;
      /** 指标名称 */
      indicator_name: string;
      /** 指标简称 */
      indicator_short_name: string;
      /** 类别 */
      category: string;
      /** 国别 */
      country: string;
      /** 报告日期（YYYY-MM-DD，对应 FRED date 字段） */
      report_date: string;
      /** 数值（对应 FRED value 字段，"." 转 null） */
      value: number | null;
      /** 单位 */
      unit: string;
      /** 频率 */
      frequency: string;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 美债收益率指标查询参数 */
    interface YieldIndicatorQueryParams {
      /** 指标代码（多选 IN 精确匹配） */
      indicator_code?: string[] | null;
      /** 报告日期起始日（YYYY-MM-DD） */
      start_date?: string | null;
      /** 报告日期结束日（YYYY-MM-DD） */
      end_date?: string | null;
      /** 每页条数 */
      limit: number;
      /** 偏移量 */
      offset: number;
    }

    /** 美债收益率指标代码（用于下拉选项，数据源为后端 Config.YIELD_INDICATORS 字典） */
    interface YieldIndicatorCode {
      /** 指标代码 */
      indicator_code: string;
      /** 指标名称 */
      indicator_name: string;
      /** 指标简称 */
      indicator_short_name: string;
      /** 类别 */
      category: string;
      /** 单位 */
      unit: string;
      /** 频率 */
      frequency: string;
    }
  }
}
