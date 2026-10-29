declare namespace Api {
  /** 基础数据模块 */
  namespace Bds {
    /** 指数代码项（用于下拉选项） */
    interface IndexCodeItem {
      /** 指数代码（如 SHSE.000001） */
      code: string;
      /** 指数名称（如 上证指数） */
      sec_name: string;
      /** gm 是否支持该指数（data_source=yfinance 的如 SP500 为 false），
       *  成分股同步的勾选项据此过滤；老后端未返回该字段时视为支持 */
      gm_supported?: boolean;
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
      /** 市场：上交所/深交所/北交所；非 A 股为 null */
      market: string | null;
      /** 板块：主板/创业板/科创板/北交所；非 A 股为 null */
      board: string | null;
      /** 上市日期（YYYY-MM-DD） */
      online_date: string | null;
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
      /** 最新报告期(含快报)（YYYY-MM-DD，来源东财 Excel，未回填为 null） */
      latest_rpt_date: string | null;
      /** 拼音缩写（来源 gm，未同步为 null） */
      sec_abbr: string | null;
      /** 退市日期（YYYY-MM-DD；在市为 null，可能为未来日期） */
      delisted_date: string | null;
      /** 同步日期：批量同步完成当日写今日，重跑据此过滤（YYYY-MM-DD，未同步为 null） */
      sync_at: string | null;
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
      /**
       * 权重（2026-10-21 已弃用）
       *
       * gm 对 000300/000905/000852 一律返回 0 或 NaN、399006 仅少数快照有值，
       * 且曾把 NaN 归一化成 0.0 ⇒「没返回」与「权重为 0」不可区分，不具备分析价值。
       * 后端已停止写入，仅历史快照可能残留数值。
       * 需要权重时一律用 `bds_daily_mktvalue.tot_mv` 现算，勿依赖此字段。
       */
      weight: number | null;
      /** 交易日期（YYYY-MM-DD） */
      trade_date: string;
      /** 指数名称 */
      sec_name: string | null;
    }

    /** 指数成分股查询参数 */
    interface IndexConstituentQueryParams {
      /** 指数代码（精确匹配） */
      index_code?: string;
      /** 成分股代码（精确匹配） */
      symbol?: string;
      /** 交易日期（YYYY-MM-DD，精确匹配） */
      trade_date?: string;
      /** 是否按成分股代码去重：每只仅保留交易日期最新的一条（同日跨指数取指数代码最小者） */
      dedup?: boolean;
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
      /** 分步执行结果（symbol-info 串行同步时返回），前端拼成「步骤名:更新N条」 */
      steps?: Array<{ step: string; result: unknown }>;
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

    /** 每日市值 */
    interface DailyMktvalue {
      /** 主键 */
      id: number;
      /** 股票代码 */
      symbol: string;
      /** 交易日期 */
      trade_date: string;
      /** 总市值 */
      tot_mv: number | null;
      /** 总市值(证监会算法) */
      tot_mv_csrc: number | null;
      /** A股市值 */
      a_mv: number | null;
      /** A股市值(剔除限售股) */
      a_mv_ex_ltd: number | null;
      /** B股市值 */
      b_mv: number | null;
      /** B股市值(剔除限售股) */
      b_mv_ex_ltd: number | null;
      /** 企业价值 */
      ev: number | null;
      /** 企业价值(剔除货币资金) */
      ev_ex_curr: number | null;
      /** 企业价值/EBITDA */
      ev_ebitda: number | null;
      /** 股权价值 */
      equity_value: number | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 每日市值查询参数 */
    interface DailyMktvalueQueryParams {
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

    /** 日频指标数据（对应 bds_daily_indicator 表，数据源 FRED API series/observations） */
    interface DailyIndicator {
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
    interface DailyIndicatorQueryParams {
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
    interface DailyIndicatorCode {
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

    /** 批量同步失败明细 */
    interface SyncError {
      /** 股票代码 */
      symbol: string;
      /** 同步表 */
      table: string;
      /** 错误信息 */
      message: string;
    }

    /** 批量同步任务 */
    interface SyncTask {
      /** 主键 */
      id: number;
      /** 同步范围: all/index/industry/explicit */
      scope: string;
      /** 范围参数: {index_codes: string[] / industry_name / symbols} */
      scope_params: Record<string, any> | null;
      /** 要同步的表列表 */
      tables: string[];
      /** 是否写 sync_at: 1=是 0=否 */
      mark_synced: number;
      /** 剔除 sync_at >= 该日期 的标的；null=不跳过 */
      exclude_synced_since: string | null;
      /** 退市口径: trading=仅在市/delisted=仅退市/all=全部（仅作用于 all/industry/index） */
      trading_status: string;
      /** 最多处理几只 symbol: 0=不限 */
      max_symbols: number;
      /** 状态: pending/running/done/failed */
      status: string;
      /** 任务总数 */
      total_count: number;
      /** 已完成数 */
      done_count: number;
      /** success 数 */
      success_count: number;
      /** no_data 数 */
      no_data_count: number;
      /** error 数 */
      error_count: number;
      /** skipped 数（名单未变/已存跳过，index_backfill 专用；其余 scope 恒 0） */
      skipped_count: number;
      /** 被拒存日数（只数校验不通过、疑 gm 伪快照，index_backfill 专用） */
      dirty_count: number;
      /** 提前中止的指数个数（被停止/连续失败超限，index_backfill 专用） */
      aborted_count: number;
      /** 进度% (0-100) */
      progress: number;
      /** 失败明细 */
      errors: SyncError[] | null;
      /**
       * 任务结果摘要（结构化，**非失败信息**）
       *
       * 仅 index_valuation 使用：`{ per_index, gated, gated_total, lagging, start_date, end_date, ... }`
       */
      result: Record<string, any> | null;
      /** 实际开始时间 */
      start_time: string | null;
      /** 实际结束时间 */
      end_time: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    // ========================================================================
    // 指数估值（bds_index_valuation）与成分核查水位（bds_index_constituent_sync）
    // ========================================================================

    /**
     * 指数估值原始数据行（`/index-valuations/paged`，一条 = 一个指数的一天）。
     *
     * 与 `IndexValuationSeries` 的区别：那个是 pivot（每指数一列）给图表画线，
     * 中间量全被压掉；这个是行式的，保留 n_total/n_valid/n_loss/snapshot_date/calc_at，
     * 可以核对「这个 PE 是怎么算出来的、用的是哪天确认的成分」。
     *
     * ⚠️ 后端 schema 是 Decimal，Pydantic v2 会序列化成字符串，取值须 `Number()`。
     */
    interface IndexValuationRow {
      /** 主键 */
      id: number;
      /** 指数代码 */
      index_code: string;
      /** 指数名称（后端从 Config.INDEX_CODE 补，不入库） */
      sec_name: string | null;
      /** 交易日期（YYYY-MM-DD） */
      trade_date: string;
      /** 指数收盘价（来自 bds_index_history） */
      close: number | null;
      /** 整体法 PE_TTM（亏损计入，主口径） */
      pe_ttm: number | null;
      /** 成分 PE 横截面中位数（仅 PE>0 样本） */
      pe_median: number | null;
      /** 整体法 PB_MRQ */
      pb_mrq: number | null;
      /** 市值加权股息率 TTM(%)，分母含全部成分市值（无分红记 0） */
      dy_ttm: number | null;
      /** 整体法市销率 TTM = ΣMV/Σ(MV/ps)；营收无负值，分母不剔除 */
      ps_ttm: number | null;
      /** 整体法市现率 TTM（经营现金流），**仅 pcf>0.5 的成分参与分子与分母**，负现金流剔除 */
      pcf_ttm_oper: number | null;
      /** 成分总市值合计（元） */
      mv_total: number | null;
      /** 成分净利润合计（元，含负值） */
      profit_total: number | null;
      /** 成分股数（有估值数据） */
      n_total: number | null;
      /** 该快照应有成分数（覆盖率分母）；n_total/expected_total < 98% 时指标为 null */
      expected_total: number | null;
      /** 有效样本数（PE 参与计算） */
      n_valid: number | null;
      /** 亏损/无 PE 数 */
      n_loss: number | null;
      /** 负/无经营现金流成分数（PCF 剔除样本审计） */
      n_cf_neg: number | null;
      /** 所用成分快照日期（可追溯） */
      snapshot_date: string | null;
      /** 本行计算时间（重算会刷新） */
      calc_at: string | null;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 指数估值原始数据查询参数 */
    interface IndexValuationPagedParams {
      /** 指数代码（多值，走 qs 的 repeat 序列化，FastAPI `List[str]` 直通） */
      index_codes?: string[];
      /** 起始日期 YYYY-MM-DD */
      start_date?: string;
      /** 结束日期 YYYY-MM-DD */
      end_date?: string;
      /** 每页条数 */
      limit?: number;
      /** 偏移量 */
      offset?: number;
    }

    /** 指数估值序列查询参数 */
    interface IndexValuationSeriesParams {
      /** 起始日期 YYYY-MM-DD，默认近 10 年 */
      start_date?: string;
      /** 结束日期 YYYY-MM-DD，默认今天 */
      end_date?: string;
      /** 指标: pe_ttm / pb_mrq / dy_ttm / pe_median */
      metric?: string;
      /** 指数代码（多值，走 qs 的 repeat 序列化） */
      index_codes?: string[];
    }

    /** 指数估值日序列（结构与 `/index-cum-returns` 对齐） */
    interface IndexValuationSeries {
      trade_dates: string[];
      series: Record<string, (number | null)[]>;
      sec_names: Record<string, string>;
      /** 成分名单末次变化日：表达「用的成分是哪天确定的」，与 trade_dates 无关 */
      last_change_dates: Record<string, string | null>;
      metric: string;
    }

    /** 单个窗口的统计量 */
    interface IndexValuationStat {
      /** 分位（%）：窗口内 <= 当前值的样本占比 */
      pct: number | null;
      min: number | null;
      max: number | null;
      median: number | null;
      /** z-score：(current - mean) / std */
      z: number | null;
      /** 窗口内样本数 */
      n: number;
    }

    /** 单指数分位汇总 */
    interface IndexValuationPercentile {
      index_code: string;
      sec_name?: string;
      metric?: string;
      current: number | null;
      /** 当前值所属交易日 */
      last_date?: string;
      /** 当前值所属交易日（语义化别名，与 last_date 同值） */
      as_of: string | null;
      /** 当前值是否落后于个股估值源末日（true ⇒ 必须提示「数据截至 as_of」） */
      is_stale: boolean;
      /** 落后自然日数（不落后为 0） */
      stale_days: number | null;
      /** 全历史分位（仅作参考：PE 中枢长期下移，会系统性显得「便宜」） */
      pct_all?: IndexValuationStat;
      /** 默认展示的分位（10 年自然日回溯） */
      pct_10y?: IndexValuationStat;
      /** 5 年分位 */
      pct_5y?: IndexValuationStat;
      /** 3 年分位 */
      pct_3y?: IndexValuationStat;
      last_change_date: string | null;
      constituent_checked_to: string | null;
      constituent_gap_days: number | null;
      /** 成分核查水位是否落后于估值序列末日（落后 ⇒ 分位可信度打折） */
      constituent_stale: boolean;
    }

    /** 分位接口整体响应（`/index-valuation-percentiles`） */
    interface IndexValuationPercentileResponse {
      metric: string;
      /** 个股估值源末日：据此判断各指数「当前值」是否已跟上 */
      latest_trade_date: string | null;
      items: IndexValuationPercentile[];
    }

    /** 指数估值重算请求体 */
    interface IndexValuationSyncRequest {
      index_codes?: string[];
      /** 增量模式重叠的交易日数（1~60），默认 5；用交易日历倒推，不是自然日 */
      days?: number;
      /** 重算起点（闭区间）；传了则所有指数共用该起点，days 失效 */
      start_date?: string | null;
      /** 重算终点（闭区间，**含当天**）；不传=算到最新 */
      end_date?: string | null;
      /** 是否同时算横截面中位数（约慢一倍） */
      with_median?: boolean;
    }

    /** 各指数成分核查水位（`/index-constituent-sync-status`） */
    interface IndexConstituentSyncStatus {
      index_code: string;
      sec_name?: string | null;
      /** 已处理到的交易日（新鲜度唯一依据） */
      checked_to: string | null;
      /** 名单最近变化日（= MAX(bds_index_constituent.trade_date)） */
      last_change_date: string | null;
      constituent_count: number | null;
      gap_days: number;
      first_gap: string | null;
      no_data_days: number;
      /** 被拒存（只数校验不通过、疑伪快照）的交易日数；该日成分回退到上一个干净名单 */
      dirty_days: number;
      /** 最早一个被拒存的交易日 */
      first_dirty: string | null;
      last_check_at: string | null;
      /** 现表内成分行数：为 0 但 checked_to 有值 ⇒ 成分行被手工删过（如上证指数） */
      current_rows: number;
    }
    /**
     * 期权合约字典（`bds_option_info`）：openctp 静态合约表本地副本。
     *
     * 回答「合约是什么」——乘数、权威到期日、A 类调整行权价。
     * 与 `OptionConfig`（要同步哪些合约）、`OptionMarket`（多少价）职责不重叠。
     */
    interface OptionInfo {
      id: number;
      /** openctp 原生合约ID；ETF 为 8 位码，正好等于券商码去掉 `SHQQ.` 前缀 */
      contract_id: string;
      /**
       * 系统标准码（派生值）。
       * ⚠️ **只在「品种 + 标的」内唯一**：ETF 沿用交易所「合约简称」口径、不含标的 6 位，
       * 9 个 ETF 标的行权价区间大量重叠 ⇒ 跨标的会返回多行（实测 422 组），不是数据错误。
       */
      symbol: string;
      /** 数据源原始名称（通常与合约ID相同；ETF 是中文简称如「500ETF沽11月6250」） */
      contract_name: string;
      exchange: string;
      /** 品种ID：IO / HO / MO / au_o / ETF_O / ...（92 个） */
      product_id: string;
      /** 标的合约ID：IO2611 / 510500 / au2612 */
      underlying_contract_id: string;
      /** C=认购 P=认沽 */
      cp: string;
      /** 行权价（交易所原始值；A 类是调整后的 7.367，不是名义的 7.500） */
      strike: number;
      /** 名义行权价（生成标准码用）：7.367 × 10180 ÷ 10000 = 7.500 */
      nominal_strike: number;
      /** 合约乘数；A 类为 10180 而非 10000，**必须与 strike 成对使用**，混用差 1.8% 市值 */
      multiplier: number;
      tick_size: number | null;
      list_date: string | null;
      /** 最后交易日（权威到期日，取代自研推算） */
      last_trade_date: string;
      delivery_date: string | null;
      /** 期权到期年月 YYYYMM（由 last_trade_date 派生，**不是**数据源的交割月） */
      expire_year_month: string;
      /** 1=最近一次全量拉取仍挂牌 0=已退市 */
      is_listed: number;
      /** 最后一次出现在数据源的日期（判退市唯一依据，`合约状态` 字段恒为 1 用不了） */
      last_seen_date: string;
      sync_time: string;
      create_time: string;
      update_time: string;
    }

    /** 合约字典查询参数（25,910 行，必须服务端分页） */
    interface OptionInfoQueryParams {
      /** 品种ID */
      product_id?: string | null;
      /**
       * 交易所ID：CFFEX / SHFE / DCE / CZCE / INE / GFEX / SSE / SZSE。
       * 是「品种」的上一级（同一品种只属于一个交易所），后端按原值大写精确匹配。
       */
      exchange?: string | null;
      /**
       * 中文品种名。**ETF 建议用它而不是 product_id**：同一 `ETF_O` 覆盖 9 个标的，
       * 只按 product_id 筛会把 510050 与 510500 混在一起。
       */
      option_name?: string | null;
      /** 标的合约ID，**模糊匹配**：5105 → 510500，IO26 → IO2611 */
      underlying_contract_id?: string | null;
      /** 到期年月 YYYYMM，**模糊匹配**：2612 → 202612 */
      expire_year_month?: string | null;
      cp?: string | null;
      is_listed?: number | null;
      /** 全域模糊搜：合约ID / 标准码 / 合约名称 / 标的 / 品种ID / 交易所（台账中文名如「股指/黄金」也命中） */
      keyword?: string | null;
      limit?: number;
      offset?: number;
    }

    /** 字典品种下拉项（只含台账已登记的品种） */
    interface OptionInfoProduct {
      option_name: string;
      und_key: string;
      product_id: string;
      /** 标的 6 位码；ETF 必有，股指/商品为 null */
      ctp_underlying: string | null;
    }

    /** 字典新鲜度 */
    interface OptionInfoLatestDate {
      latest_seen_date: string | null;
      rows: number;
      listed_rows: number;
      sync_time: string | null;
    }

    /**
     * 期权行情同步清单（`bds_option_config`）
     *
     * ⚠️ 2026-10-27 瘦身后本表只剩「同步意图」7 列。下面标 **[只读派生]** 的字段
     * 物理上不存在于表里，是后端 join `bds_option_info` / 品种台账后现算返回的，
     * **PUT 改不了**——要修只能刷新合约字典。
     */
    interface OptionConfig {
      id: number;
      /** openctp 合约ID（唯一身份，与 bds_option_info.contract_id 1:1） */
      contract_id: string;
      /** 交易所标准期权代码（IO2611-P-4000 / P2611M06250 / au2612P840）【只读派生：字典表】 */
      symbol: string | null;
      /** 券商账单代码（ETF 才有，如 SHQQ.10012562；与交易所码无字符串关系） */
      broker_symbol: string | null;
      /** 标的代码【只读派生】 */
      underlying_symbol: string | null;
      /** 情景分组键 csi300 / csi500etf / au【只读派生】 */
      und_key: string | null;
      // 🔴 2026-10-27 三次变更：cp / strike / multiplier / margin_type / expiry_date
      //    五个规格字段已从响应体删除（前端「规格（来自合约字典）」列整列下线）。
      //    要看规格去「合约字典」页（GET /option-info），本清单只答「同步什么、怎么拉」。
      /** akshare 品种名 */
      option_name: string;
      /** 到期年月 YYYYMM；商品期权为 ALL（接口一次返回全部月份） */
      end_month: string | null;
      /** 1=参与一键同步 */
      is_enabled: number;
      /** 到期日（YYYY-MM-DD）【只读派生：字典 last_trade_date，权威值】；null=字典里查不到 */
      expiry_date: string | null;
      // 🔴 2026-10-27 四次变更：source / note 已从表与响应体一并删除
      //    （import-holding 下线后的残留，恒为 holding + 券商码复述）。
      //    本清单可编辑的只有 broker_symbol 与 is_enabled 两个人字段。
      create_time: string;
      update_time: string;
    }

    /**
     * 新增同步配置入参
     *
     * 🔴 不再接受手工拼码：合约必须能在合约字典里解析到，否则 400。
     * `contract_id` 优先（全表唯一）；用 `symbol` 时 ETF 必须带 `option_name`，
     * 因为 ETF 标准码不含标的 6 位、跨标的存在同码。
     */
    interface OptionConfigCreate {
      /** 合约字典主键（openctp「合约ID」，ETF 即券商码数字部分）——推荐 */
      contract_id?: string | null;
      /** 交易所标准码，仅作查询入口（后端落库前会兑换成 contract_id） */
      symbol?: string | null;
      option_name: string;
      /** 留空按字典的到期年月推导；商品期权恒 ALL */
      end_month?: string | null;
      broker_symbol?: string | null;
      is_enabled?: number;
    }

    /** 修改同步配置：只能改人工列，别的什么都改不了 */
    interface OptionConfigUpdate {
      /** 券商账单代码（对账用，不参与计算）；**传空串 '' 表示清空**，不传=不改 */
      broker_symbol?: string | null;
      is_enabled?: number | null;
    }

    /** 期权行情（`bds_option_market`，按日快照） */
    interface OptionMarket {
      id: number;
      /** openctp 合约ID（唯一身份；后端已按它 join 字典表算派生字段） */
      contract_id: string;
      broker_symbol: string | null;
      /** 行情日期（交易日，非同步日） */
      trade_date: string;
      /** 标的代码【后端派生：品种台账】 */
      underlying_symbol: string;
      /** 情景分组键【后端派生：品种台账】 */
      und_key: string;
      /** call / put【后端派生：info.cp】 */
      option_type: string;
      price_strike: number;
      /** 到期日【后端派生：info.last_trade_date】 */
      delisted_date: string | null;
      /** 剩余自然日 = 到期日 − 行情日【后端派生】 */
      days_left: number | null;
      /** 合约乘数（A 类 10180）【后端派生：info.multiplier】 */
      multiplier: number;
      /** 字典缺该合约时为 true ⇒ 上面几个派生字段全部为空（正常不会出现） */
      info_missing?: boolean;
      /** 最新价：盘中实时 / 盘后收盘 */
      price: number | null;
      /** 前结算价（三种品种都有） */
      pre_settle: number | null;
      /** 结算价：**仅商品期权可得**，股指/ETF 恒为 null（接口不提供，不是数据缺失） */
      settle: number | null;
      /** 标的价（同步时点的标的现价，非该交易日收盘） */
      price_ud: number | null;
      /** 内在价值（钩子落库时计算） */
      value_i: number | null;
      /** 时间价值（钩子落库时计算，可为负） */
      value_t: number | null;
      /** 平值(%) = (行权价/标的价−1)×100（钩子落库时计算） */
      atm_i: number | null;
      /** 时间(%) = 时间价值/行权价×100（钩子落库时计算） */
      ratio_t: number | null;
      /** 内在(%) = 内在价值/行权价×100（钩子落库时计算） */
      ratio_i: number | null;
      /** 时间(%Y) = ratio_t×365/剩余天（钩子落库时计算） */
      ratio_t_y: number | null;
      /** 内在(%Y) = ratio_i×365/剩余天（钩子落库时计算） */
      ratio_i_y: number | null;
      /** delta：仅商品期权可得，认沽为负 */
      delta_opt: number | null;
      /** 成交量：ETF 接口的「数量」列恒等于行数，不可信 ⇒ 恒 null */
      volume: number | null;
      /** 持仓量：ETF 恒 null */
      open_interest: number | null;
      /** 接口返回的行情时点（ETF 带完整时间戳） */
      quote_time: string | null;
      source: string;
      sync_time: string;
      create_time: string;
      update_time: string;
    }

    /** 期权行情查询参数 */
    interface OptionMarketQueryParams {
      und_key?: string | null;
      option_name?: string | null;
      end_month?: string | null;
      option_type?: string | null;
      /** 合约ID（openctp），模糊匹配；标准码已不在行情表返回 */
      contract_id?: string | null;
      /** **起始**行情日期 YYYY-MM-DD（筛到最新）；不传=全部历史，按交易日倒序 */
      trade_date?: string | null;
      /** 只取当前筛选范围内最新交易日的快照（T 型报价页用，品种级最新） */
      latest_only?: boolean;
      limit?: number;
      offset?: number;
    }

    /** 同步前置确认信息（点「行情同步」弹窗） */
    interface OptionSyncPlan {
      /** 启用配置的合约张数 */
      symbol_count: number;
      /** 品种×到期月组合数（= 接口请求次数，进度按组报） */
      group_count: number;
      option_names: string[];
      groups: { option_name: string; end_month: string }[];
    }

    /** 最新行情日期与各品种行数 */
    interface OptionMarketLatestDate {
      latest_trade_date: string | null;
      by_und: Record<string, number>;
      sync_time: string | null;
    }

    /** 期权下拉选项 */
    interface OptionMarketFilters {
      option_names: string[];
      end_months: string[];
      und_keys: string[];
    }
  }
}
