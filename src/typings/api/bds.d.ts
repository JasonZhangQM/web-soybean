declare namespace Api {
  /** 基础数据模块 */
  namespace Bds {
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
      /** 开始日期（YYYY-MM-DD） */
      start_date?: string;
      /** 结束日期（YYYY-MM-DD） */
      end_date?: string;
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
  }
}
