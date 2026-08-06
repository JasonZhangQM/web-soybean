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

    /** 期权监测合并（对应 OptionMonitorOut，共 19 字段，合并配置与监测） */
    interface OptionMonitor {
      /** 标的代码 */
      underlying_symbol: string;
      /** 行权价 */
      price_strike: number;
      /** 行权日 */
      delisted_date: string;
      /** 剩余天数 */
      days_left: number | null;
      /** 期权乘数 */
      multiplier: number;
      /** 期权代码 */
      symbol: string;
      /** 期权类型(call/put) */
      option_type: string;
      /** 标的现价 */
      price_ud: number | null;
      /** 期权现价 */
      price: number | null;
      /** 时间价值 */
      value_t: number | null;
      /** 内在价值 */
      value_i: number | null;
      /** 平值(%) */
      atm_i: number | null;
      /** 时间(%) */
      ratio_t: number | null;
      /** 内在(%) */
      ratio_i: number | null;
      /** 时间(%Y) */
      ratio_t_y: number | null;
      /** 内在(%Y) */
      ratio_i_y: number | null;
      /** 主键 */
      id: number;
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

    /** 估值监测（对应 ValueMonitorOut，共 25 字段，独立表含估值区间+行情+监测字段） */
    interface ValueMonitor {
      /** 代码 */
      symbol: string;
      /** 名称 */
      name: string | null;
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
      /** 主键 */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }
  }
}
