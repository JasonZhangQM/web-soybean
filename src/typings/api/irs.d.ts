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

    /** 估值监测（对应 ValueMonitorOut，主表 27 字段 + 9 个 v3 派生字段） */
    interface ValueMonitor {
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
      /** 派生：待执行计划数 */
      plan_pending: number | null;
      /** 派生：已执行计划数 */
      plan_done: number | null;
      /** 主键（会漂移，关联键一律用 symbol） */
      id: number;
      /** 创建时间 */
      create_time: string;
      /** 更新时间 */
      update_time: string;
    }

    /** 档位版本（对应 VmVersionOut）：五档 + 现算 pv_* + 状态 + 与上一版差值 */
    interface VmVersion {
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

    /** 标的研究（对应 VmResearchOut，按 research_date 留版） */
    interface VmResearch {
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

    /** 计划委托（对应 VmPlanOut，用真实合约代码 + 点位） */
    interface VmPlan {
      id: number;
      /** 归属标的（irs_value_monitor.symbol） */
      vm_symbol: string;
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
      qty: number | null;
      valid_until: string | null;
      reason: string | null;
      /** 实际执行的成交 ID */
      bill_id: number | null;
      is_cancelled: boolean;
      /** 派生：已放弃 > 已执行 > 已过期 > 待执行 */
      status: string;
      /** 派生：有效触发价 = trigger_price ?? 当前档位值 */
      effective_trigger: number | null;
      /** 派生：引用档位当前值 */
      trigger_ref_value: number | null;
      create_time: string;
      update_time: string;
    }

    /** 投资逻辑（对应 VmLogicOut） */
    interface VmLogic {
      id: number;
      symbol: string;
      seq: number;
      content: string;
      /** 定价依据 */
      pricing: string | null;
      /** 状态：完好 / 受损 / 破坏 */
      state: string;
      state_at: string | null;
      evidence: string | null;
      create_time: string;
      update_time: string;
    }

    /** 证伪条件（对应 VmInvalidateOut） */
    interface VmInvalidate {
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
      status: string;
      triggered_at: string | null;
      create_time: string;
      update_time: string;
      /** 派生：signal 里没有数字阈值 -> 前端标红 */
      quantified: boolean;
    }

    /** 归属覆盖率行（每个标的的合约行数与成交笔数） */
    interface VmCoverageRow {
      symbol: string;
      name: string | null;
      group_rows: number | null;
      bill_rows: number | null;
    }

    /** 未归属合约行 */
    interface VmUnmappedRow {
      id: number;
      category: string;
      symbol: string;
      count: number | null;
      pf_total: number | null;
      bill_rows: number | null;
    }
  }
}
