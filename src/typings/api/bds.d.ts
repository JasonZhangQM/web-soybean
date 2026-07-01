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

    /** 同步结果（{status, message}） */
    interface SyncResult {
      /** 同步状态 */
      status: string;
      /** 同步消息 */
      message: string;
    }
  }
}
