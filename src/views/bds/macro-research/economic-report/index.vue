<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useBdsStore } from '@/store/modules/bds';
import { fetchEconomicIndicatorsLatest, syncEconomicIndicator, syncAllEconomicIndicators } from '@/service/api/bds';
import { executeSync } from '@/utils/sync-feedback';
import RadarChart from './modules/radar-chart.vue';
import WeightBarChart from './modules/weight-bar-chart.vue';
import SankeyChart from './modules/sankey-chart.vue';
import MetricCard from './modules/metric-card.vue';

defineOptions({ name: 'EconomicReportPage' });

const bdsStore = useBdsStore();
const latestData = ref<Api.Bds.EconomicIndicator[]>([]);
const loading = ref(false);
const syncLoading = ref(false);
const syncAllLoading = ref(false);
const syncSymbol = ref<string | null>(null);

// 核心指标代码列表（用于卡片展示）
const CORE_INDICATORS = [
  'FED_FUNDS_RATE',
  'CPI_YOY',
  'NONFARM_PAYROLL',
  'GDP_QOQ',
  'ISM_MFG_PMI',
  'CONSUMER_CONFIDENCE',
  'RETAIL_SALES_MOM',
  'YIELD_SPREAD_2Y10Y'
];

// 指标代码下拉选项（从 store 动态获取）
const indicatorOptions = computed(() => bdsStore.getIndicatorCodeOptions());

// 传导链流程图数据：通胀 → 利率 → 估值 → 股市
const flowChain1 = [
  { text: 'CPI/PCE通胀', gold: false },
  { text: '美联储利率决策', gold: false },
  { text: '10Y美债收益率', gold: false },
  { text: '股票估值(DCF)', gold: true },
  { text: '美股涨跌', gold: true }
];

// 就业-消费-产出三角流程图数据
const flowChain2 = [
  { text: '非农就业', gold: false },
  { text: '零售销售', gold: false },
  { text: 'GDP增长', gold: true },
  { text: '企业盈利', gold: false },
  { text: '美股EPS', gold: true }
];

// 引用来源列表
const sources = [
  { id: 1, title: '雪球, "基础篇·第二课 —— 宏观经济核心数据：看懂美股的「经济温度计」". 系统介绍美股宏观数据底层认知，涵盖GDP、CPI、PCE、就业等核心指标及其对美股的影响逻辑。', url: 'https://xueqiu.com/2145355131/370383889' },
  { id: 2, title: 'SPRC Open, "Machine Learning Forecasting of Stock Market Indices Based on Macroeconomic Indicators", Frontiers in Business and Finance, 2025. 机器学习研究发现通胀和利率解释了约60%的股价变动。', url: 'https://sprcopen.com/index.php/FBF/article/download/376/391/1089' },
  { id: 3, title: 'Federal Reserve, FOMC Minutes May 2025. 美联储维持联邦基金利率目标区间4.25%-4.5%，关注双向风险。', url: 'https://www.federalreserve.gov/monetarypolicy/fomcminutes20250507.htm' },
  { id: 4, title: '雪球, "美联储利率对股票估值的影响". 完整传导路径：美联储加息/降息 → 银行间拆借成本 → 短期国债收益率 → 10年期美债收益率 → WACC折现率变化。', url: 'https://xueqiu.com/6111690750/389475032' },
  { id: 5, title: 'Bilibili, "美股前200强财务基本面与美联储利率政策影响深度分析报告(2026年)". 当10年期美债收益率从4%升至4.5%时，折现率同步上升约12.5%，资产现值下降约11%。', url: 'https://www.bilibili.com/opus/1203194144101498887' },
  { id: 6, title: '新浪财经, "美联储降息预期对科技股现金流折现模型的可靠性影响几何?". 折现率每上升1%，部分科技股估值可能缩水10%以上。', url: 'https://news.sina.cn/bignews/insight/2026-04-17/detail-inhuvkxa0912308.d.html' },
  { id: 7, title: '中国金融新闻网, "美联储降息开启全球货币政策新周期：理论逻辑、多维影响与中国方略". 预防式降息通过降低贴现率和改善风险偏好两个渠道利好美股。', url: 'https://www.financialnews.com.cn/m/2025-11/24/content_437944.html' },
  { id: 8, title: 'AInvest, "U.S. Labor Market Cooling and the Fed\'s Dovish Pivot: Sector Rotation and Risk-Adjusted Returns in 2025". 美联储2025年9月点阵图显示联邦基金利率中位数预计降至3.6%。', url: 'https://www.ainvest.com/news/labor-market-cooling-fed-dovish-pivot-sector-rotation-risk-adjusted-returns-2025-2510/' },
  { id: 9, title: 'EquityMarkets.us, "Understanding U.S. Economic Data in 2025: Key Indicators Driving Markets and Investor Decisions". 综合介绍GDP、CPI、就业、零售销售、消费者信心等指标及其市场影响。', url: 'https://equitymarkets.us/understanding-u-s-economic-data-in-2025-key-indicators-driving-markets-and-investor-decisions/' },
  { id: 10, title: 'Trading-Signals.ai, "Economic Indicators That Impact the Stock Market: What Every Investor Should Watch". 10大经济指标对美股的影响分析，包括CPI、PPI、ISM PMI和收益率曲线。', url: 'https://trading-signals.ai/economic-indicators-that-impact-the-stock-market/' },
  { id: 11, title: 'Nasdaq, "August 2025 Review and Outlook". 2025年8月非农就业新增7.3万人（预期10.5万人），失业率4.2%，就业不足率升至7.9%。', url: 'https://www.nasdaq.com/articles/august-2025-review-and-outlook' },
  { id: 12, title: '雪球, "2025年美国GDP初值30.77万亿美元，同比增长2.1%". 美国商务部经济分析局2025年全年GDP数据。', url: 'https://xueqiu.com/5296061618/379428166' },
  { id: 13, title: 'Morningstar, "How Healthy Is the US Economy? Here\'s What the Top Economic Indicators Say". 2025年Q1 GDP萎缩0.5%，Q2反弹3%，主要由关税前企业集中进口导致。', url: 'https://www.morningstar.com/economy/how-healthy-is-us-economy-heres-what-top-economic-indicators-say' },
  { id: 14, title: '百科, "3·10美股暴跌". GDPNow模型显示净出口对GDP贡献率下滑至-3.84%。', url: 'https://m.baike.com/wiki/3%C2%B710%E7%BE%8E%E8%82%A1%E6%9A%B4%E8%B7%8C/7480545871789506611' },
  { id: 15, title: '东方财富, "必修课(一)：宏观经济四象限 + 领先宏观指标完整跟踪体系". PMI作为核心领先指标，连续位于50以上/以下判断经济扩张/收缩。', url: 'https://caifuhao.eastmoney.com/news/20260617215831190018600' },
  { id: 16, title: 'WinvestaCrisps, "What investors mean by ISM and why it matters this week". PMI高于42.3历史上对应GDP正增长，高于50对应GDP加速增长。', url: 'https://www.winvestacrisps.in/p/what-investors-mean-by-ism-and-why' },
  { id: 17, title: '新浪财经, "美国PMI升至55.7，欧元区PMI走低". 2026年ISM制造业PMI 54%，新订单指数56.8%连续5个月扩张，就业指数48.6%处收缩区间。', url: 'https://cj.sina.cn/article/norm_detail?froms=ttmp&url=...' },
  { id: 18, title: '雪球, "美国制造业真的复苏了吗？库存和韩国出口给出线索". ISM制造业PMI重回54.00，与54.50服务业PMI形成双轮驱动，新订单回升、低客户库存构成补库驱动力。', url: 'https://xueqiu.com/1105680996/394434132' },
  { id: 19, title: 'CollinsEOW, "Consumer Confidence Index: How It Affects Stocks". 消费者信心指数高于100表示乐观，低于100表示悲观，影响可选消费板块。', url: 'https://collinseow.com/consumer-confidence-index/' },
  { id: 20, title: 'Lying-Awake, "Retail Sales Reports: How Consumer Spending Moves the Stock Market". 标普500可选消费板块与零售销售超预期幅度存在0.78相关性。', url: 'https://lying-awake.net/retail-sales-reports-how-consumer-spending-moves-the-stock-market' },
  { id: 21, title: 'AInvest, "Yield Curve Warning: Is a Recession Looming?". 美联储分析显示2Y-10Y利差转负后，美国经济平均12-18个月内出现衰退。', url: 'https://www.ainvest.com/news/yield-curve-warning-recession-looming-2507/' },
  { id: 22, title: 'MarketMinute, "The Unsettling Normalization: Yield Curve\'s Un-Inversion Signals Potential Storm Ahead". 2025年4月收益率曲线解除倒挂，属于"牛陡"——短期利率下降快于长期利率，预示衰退风险。', url: 'https://www.marketminute.com/article/marketminute-2025-9-16-the-unsettling-normalization-yield-curves-un-inversion-signals-potential-storm-ahead' },
  { id: 23, title: 'MarketMinute, "The Great Normalization: How the Steepening Yield Curve Reshaped the Growth-Value War in 2025". 收益率曲线回归正斜率，结束了美国历史上最长的倒挂期，改变了成长股与价值股的相对表现。', url: 'https://wyow.marketminute.com/article/marketminute-2025-12-23-the-great-normalization-how-the-steepening-yield-curve-reshaped-the-growth-value-war-in-2025' }
];

// 加载最新数据
async function loadLatest() {
  loading.value = true;
  const { data, error } = await fetchEconomicIndicatorsLatest();
  if (!error && data) {
    latestData.value = data;
  }
  loading.value = false;
}

// 单指标同步
async function handleSync() {
  if (!syncSymbol.value) {
    window.$message?.warning('请选择要同步的指标');
    return;
  }
  await executeSync(() => syncEconomicIndicator(syncSymbol.value!), syncLoading, loadLatest);
}

// 全量同步
async function handleSyncAll() {
  await executeSync(() => syncAllEconomicIndicators(), syncAllLoading, loadLatest);
}

// 获取指标数据用于卡片
function getIndicatorData(code: string) {
  return latestData.value.find(item => item.indicator_code === code) || null;
}

onMounted(() => {
  loadLatest();
  bdsStore.loadIndicatorCodes();
});
</script>

<template>
  <div class="economic-report">
    <!-- ========== Hero 标题区 ========== -->
    <header class="hero">
      <h1>影响美股走势的核心经济指标深度分析</h1>
      <p class="subtitle">系统梳理8大关键经济指标对美股的影响逻辑、传导机制与相互作用关系，构建宏观分析与投资决策框架</p>
      <p class="meta">2026年7月 · 研究分析报告</p>
    </header>

    <!-- ========== 主内容区 ========== -->
    <main class="container">
      <!-- 同步工具栏 -->
      <NCard :bordered="false" class="card-wrapper mb-16px" size="small">
        <NForm inline label-placement="left" class="flex flex-wrap gap-12px">
          <NFormItem label="指标代码">
            <NSelect
              v-model:value="syncSymbol"
              :options="indicatorOptions"
              filterable
              clearable
              placeholder="选择指标代码"
              style="width: 240px"
            />
          </NFormItem>
          <NFormItem>
            <NSpace>
              <NButton type="primary" :loading="syncLoading" @click="handleSync">
                <template #icon><SvgIcon icon="mdi:sync" /></template>
                同步
              </NButton>
              <NButton type="primary" :loading="syncAllLoading" @click="handleSyncAll">
                <template #icon><SvgIcon icon="mdi:sync-alert" /></template>
                同步全部
              </NButton>
            </NSpace>
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 动态数据卡片网格 -->
      <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mb-32px">
        <NGi v-for="code in CORE_INDICATORS" :key="code" span="24 s:12 m:8 l:6">
          <MetricCard :indicator="getIndicatorData(code)" :loading="loading" />
        </NGi>
      </NGrid>

      <!-- ===== 概述 ===== -->
      <section>
        <h2>概述</h2>
        <p>美股市场由机构投资者主导（占比超过70%），其决策逻辑根植于两条主线：<mark class="key">"经济基本面 → 企业盈利 → 股价"</mark> 和 <mark class="key">"政策预期 → 资金成本 → 资产定价"</mark>。<sup>[1]</sup> 宏观经济指标作为经济的"温度计"，既直接反映经济冷热，又通过改变市场对美联储政策的预期间接影响资产价格——这两种力量共同决定了美股的走向。</p>
        <p>机器学习研究进一步表明，通胀和利率指标在所有预测模型中解释了约 <strong>60%</strong> 的股价变动解释力，凸显了货币政策变量在美股定价中的核心地位。<sup>[2]</sup> 然而，单一指标无法完整刻画市场全貌——指标之间的相互作用往往比单一指标本身更具决定意义。</p>
        <p>本报告从众多经济指标中遴选出 <strong>8个核心指标</strong>，逐一分析其影响逻辑，并在此基础上深入探讨指标间的联动与博弈关系，最终构建一个系统的宏观分析框架。</p>
        <figure class="chart-figure">
          <figcaption>图1：核心经济指标影响力五维雷达图</figcaption>
          <RadarChart />
        </figure>
        <div class="callout">
          <strong>选取标准：</strong> 指标对美股的直接影响显著性、市场关注度、数据发布频率、以及与其他指标的联动密度。8个指标覆盖了增长、通胀、就业、消费、制造业、货币政策和市场预期等维度，构成完整的宏观分析矩阵。
        </div>
      </section>

      <!-- ===== 一、联邦基金利率 ===== -->
      <section>
        <h2>一、联邦基金利率与美联储货币政策</h2>
        <h3>指标定义</h3>
        <p>联邦基金利率（Federal Funds Rate）是美国同业拆借市场的基准利率，由美联储通过公开市场操作调控。美联储每年召开8次FOMC会议决定利率走向，同时通过会议纪要、点阵图和经济预测摘要（SEP）向市场传递前瞻指引。<sup>[3]</sup></p>
        <h3>传导机制</h3>
        <p>利率对美股的影响通过<strong>三重渠道</strong>传导：</p>
        <h4>1. 估值渠道（DCF模型）</h4>
        <p>美联储加息/降息 → 短期国债收益率变化 → 10年期美债收益率（全球无风险利率Rf）变化 → 加权平均资本成本（WACC）上升/下降 → 未来现金流折现值降低/升高。<sup>[4]</sup> 当10年期美债收益率从4%升至4.5%时，折现率同步上升约12.5%，资产现值下降约11%。<sup>[5]</sup> 科技股因远期现金流占比高，对折现率变动尤为敏感——折现率每上升1%，部分高估值科技股估值可能缩水10%以上。<sup>[6]</sup></p>
        <h4>2. 流动性渠道</h4>
        <p>高利率收紧金融条件，抑制企业借贷和投资扩张，同时提高消费者信贷成本，压缩消费支出。反之，降息释放流动性，降低融资成本，刺激经济活动。</p>
        <h4>3. 风险偏好渠道</h4>
        <p>根据资产定价理论，降息通过降低贴现率和改善风险偏好两个渠道利好美股。<sup>[7]</sup> 历史数据显示，1995年美联储预防式降息后，纳斯达克指数全年上涨39.6%。<sup>[7]</sup> 2025年9月FOMC降息后，美联储点阵图显示联邦基金利率中位数预计降至3.6%，推动了明显的板块轮动。<sup>[8]</sup></p>
        <div class="callout accent2">
          <strong>关键洞察：</strong> 利率是"万有引力"——它不直接决定股价，但改变了所有资产的定价基准。利率走向是影响美股最重要的单一变量。
        </div>
        <h3>市场反应特征</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>政策方向</th><th>成长股</th><th>价值股</th><th>金融股</th><th>REITs/公用事业</th></tr></thead>
            <tbody>
              <tr><td><strong>加息周期</strong></td><td>承压最大</td><td>相对抗跌</td><td>净息差扩张，利好</td><td>承压</td></tr>
              <tr><td><strong>降息周期</strong></td><td>估值修复，领涨</td><td>温和受益</td><td>净息差收窄</td><td>受益于折现率下降</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ===== 二、通胀 ===== -->
      <section>
        <h2>二、通胀指标（CPI &amp; PCE）</h2>
        <h3>指标定义</h3>
        <p>CPI（消费者物价指数）衡量消费者端一篮子商品和服务的价格变化；PCE（个人消费支出价格指数）是美联储首选的通胀指标，能更全面反映消费者行为变化（如替代效应）。核心CPI和核心PCE剔除食品和能源后更能反映趋势性通胀。<sup>[1]</sup></p>
        <h3>影响逻辑</h3>
        <p>通胀通过<strong>三条路径</strong>影响美股：</p>
        <h4>1. 货币政策预期通道（最重要）</h4>
        <p>通胀是美联储政策决策的首要依据。通胀超预期 → 市场预期加息/推迟降息 → 利率上升 → 估值承压。反之，通胀温和回落 → 降息预期升温 → 估值修复。2025年5月CPI同比上涨3.2%，美联储随即释放谨慎信号，科技和成长股短期承压。<sup>[9]</sup></p>
        <h4>2. 企业盈利通道</h4>
        <p>适度通胀（2%-3%）有利于企业定价权，可传导成本至终端，维持利润率。但高通胀（>5%）推升原材料和劳动力成本，若企业无法完全转嫁，利润率将显著压缩。PPI（生产者物价指数）领先CPI，可预判企业成本压力。<sup>[10]</sup></p>
        <h4>3. 实际收益率通道</h4>
        <p>通胀上升降低实际收益率，可能促使资金从债券流向股票等实物资产，形成"通胀对冲"需求。但这一效应在通胀温和时较明显，通胀过高时反而引发恐慌。</p>
        <div class="metric-grid-static">
          <div class="metric-card-static"><div class="val">2%</div><div class="lbl">美联储通胀目标（PCE）</div></div>
          <div class="metric-card-static"><div class="val">3.2%</div><div class="lbl">2025年5月CPI同比<sup>[9]</sup></div></div>
        </div>
        <div class="callout accent2">
          <strong>关键洞察：</strong> 市场不是对通胀的绝对水平做出反应，而是对"通胀偏离预期的程度"定价。超预期的通胀数据往往引发剧烈的利率重定价，是美股单日波动的主要触发器之一。
        </div>
      </section>

      <!-- ===== 三、就业数据 ===== -->
      <section>
        <h2>三、就业数据（非农就业与失业率）</h2>
        <h3>指标定义</h3>
        <p>非农就业人数（Nonfarm Payrolls）每月由美国劳工统计局发布，衡量非农业部门新增就业岗位。失业率（Unemployment Rate）衡量劳动力中无工作但正在求职的人口比例。此外，劳动参与率、平均时薪增速和U6就业不足率也是重要的辅助指标。<sup>[11]</sup></p>
        <h3>影响逻辑</h3>
        <p>就业数据是<strong>"金发女孩"效应</strong>的最典型体现——既不能太强（引发加息担忧），也不能太弱（引发衰退担忧）：</p>
        <h4>1. "坏消息即好消息"现象</h4>
        <p>在加息周期中，就业数据疲软反而可能被市场解读为利好，因为这降低了美联储继续加息的必要性。例如2025年8月非农仅新增7.3万人（预期10.5万人），虽然表面利空，但市场反而因降息预期升温而反弹。<sup>[11]</sup></p>
        <h4>2. "好消息即坏消息"现象</h4>
        <p>当就业数据过于强劲，市场担忧劳动力市场过热将推升工资通胀，迫使美联储维持紧缩立场。此时强劲的就业报告反而导致股市下跌。</p>
        <h4>3. 工资-通胀螺旋风险</h4>
        <p>平均时薪增速是美联储密切关注的指标。若工资增速持续高于生产率增速，可能形成"工资-物价"螺旋上升，迫使美联储更激进加息。2025年8月平均时薪环比增长0.3%，同比增长3.8%，被市场密切关注。<sup>[11]</sup></p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>就业数据情境</th><th>市场逻辑</th><th>美股反应</th></tr></thead>
            <tbody>
              <tr><td>就业强劲 + 通胀温和</td><td>经济软着陆，盈利增长</td><td>全面利好</td></tr>
              <tr><td>就业强劲 + 通胀高企</td><td>加息预期升温</td><td>成长股承压，价值股分化</td></tr>
              <tr><td>就业疲软 + 通胀回落</td><td>降息预期升温</td><td>短期利好，成长股反弹</td></tr>
              <tr><td>就业疲软 + 通胀高企</td><td>滞胀风险</td><td>全面利空，波动加剧</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ===== 四、GDP ===== -->
      <section>
        <h2>四、GDP增长率</h2>
        <h3>指标定义</h3>
        <p>GDP（国内生产总值）衡量美国生产的全部最终商品和服务的市场价值，是最广泛的经济健康度量。实际GDP剔除通胀因素，反映真实增长；名义GDP包含价格变动。投资者关注季度年化环比增速和同比增速，以及GDPNow等实时预测模型。<sup>[9]</sup></p>
        <h3>影响逻辑</h3>
        <p>GDP作为<strong>滞后确认指标</strong>，其影响更多体现在<strong>趋势确认和预期修正</strong>上：</p>
        <h4>1. 企业盈利锚定</h4>
        <p>GDP增长直接对应企业营收和盈利增长。长期来看，标普500盈利增速与名义GDP增速高度相关。2025年美国实际GDP同比增长2.1%，五年平均增长3.3%，为美股提供了基本面支撑。<sup>[12]</sup></p>
        <h4>2. 衰退确认</h4>
        <p>GDP连续两个季度负增长被广泛视为"技术性衰退"的信号。2025年Q1美国GDP萎缩0.5%（主要因关税前企业集中进口导致），曾在当时引发市场短期恐慌，但Q2反弹3%后担忧迅速消退。<sup>[13]</sup></p>
        <h4>3. 结构重于总量</h4>
        <p>GDP构成（消费、投资、政府支出、净出口）比总量增速更具指导意义。例如，净出口对GDP的贡献率从2024年Q4的0.12%下滑至2025年初的-3.84%，预示着贸易逆差扩大的压力。<sup>[14]</sup></p>
        <div class="callout">
          <strong>关键洞察：</strong> GDP是"后视镜"——它确认已经发生的趋势，而非预测未来。但GDP超预期或大幅低于预期时，仍会引发市场的剧烈重定价，尤其是当GDP数据与高频指标（如PMI、零售销售）出现方向性矛盾时。
        </div>
      </section>

      <!-- ===== 五、ISM PMI ===== -->
      <section>
        <h2>五、ISM制造业与服务业PMI</h2>
        <h3>指标定义</h3>
        <p>ISM采购经理人指数（PMI）由美国供应管理协会（ISM）每月发布，分为制造业PMI和服务业PMI。PMI以50为荣枯线，由新订单、生产、就业、供应商交付和库存五个分项加权构成。<sup>[10]</sup> PMI是典型的<strong>领先指标</strong>，通常领先GDP约1-2个季度。<sup>[15]</sup></p>
        <h3>影响逻辑</h3>
        <h4>1. 作为GDP的先行指标</h4>
        <p>ISM PMI超过42.3通常对应GDP正增长，超过50则对应GDP加速增长。PMI的拐点往往领先GDP拐点，是判断经济周期切换的核心工具。<sup>[16]</sup> 2026年美国ISM制造业PMI回升至54%，新增订单指数56.8%连续5个月扩张，但就业分项48.6%仍处收缩区间，体现了"增长 + 结构性矛盾"的复杂格局。<sup>[17]</sup></p>
        <h4>2. 分项信息价值</h4>
        <p>PMI的<strong>新订单分项</strong>和<strong>物价支付分项</strong>是市场最关注的两个子指标。新订单反映未来需求，物价支付分项领先CPI约1-3个月。库存分项（客户库存过高/过低）预示补库周期。<sup>[18]</sup></p>
        <h4>3. 板块映射</h4>
        <p>制造业PMI扩张利好工业、材料、能源、运输板块；服务业PMI影响更广泛，与消费、科技、金融等行业高度相关。当制造业PMI与服务业PMI同时高于50，"双轮驱动"格局对美股最为有利。<sup>[18]</sup></p>
      </section>

      <!-- ===== 六、消费者信心 ===== -->
      <section>
        <h2>六、消费者信心指数</h2>
        <h3>指标定义</h3>
        <p>消费者信心指数（CCI）由美国谘商会（Conference Board）每月发布，通过对家庭对当前经济状况和未来预期的调查编制。密歇根大学消费者信心指数是另一个重要替代指标，更侧重消费支出意愿。<sup>[19]</sup> 基准值100，高于100表示乐观，低于100表示悲观。</p>
        <h3>影响逻辑</h3>
        <h4>1. 消费支出的情绪先行</h4>
        <p>消费者信心领先实际消费支出约1-2个月。信心高涨时，消费者更愿意进行大额消费（耐用品、住房、汽车），直接驱动相关板块盈利。消费者信心与标普500可选消费板块指数存在约0.78的相关性。<sup>[20]</sup></p>
        <h4>2. 自我实现的预言</h4>
        <p>消费者信心既是经济状况的反映，也是未来经济状况的驱动力。信心下降 → 消费收缩 → 企业盈利下滑 → 裁员 → 信心进一步下降——这一负反馈循环是经济衰退自我强化的核心机制。</p>
        <h4>3. 与硬数据的互为验证</h4>
        <p>消费者信心属"软数据"（调查类），需与"硬数据"（零售销售、就业等）交叉验证。当软硬数据出现方向性背离时，往往预示着市场拐点。例如，信心高企但零售销售持续走弱，可能意味着消费者面临实际购买力约束。</p>
      </section>

      <!-- ===== 七、零售销售 ===== -->
      <section>
        <h2>七、零售销售</h2>
        <h3>指标定义</h3>
        <p>零售销售（Retail Sales）由美国人口普查局每月发布，衡量消费者在零售渠道的总支出金额。消费支出约占美国GDP的<strong>70%</strong>，使零售销售成为衡量经济健康度的核心"硬数据"。<sup>[9]</sup></p>
        <h3>影响逻辑</h3>
        <h4>1. 经济体温的即时读数</h4>
        <p>零售销售是美国经济最直接的高频"体温计"。强劲的零售销售 → 消费驱动型经济健康 → 企业盈利预期上修 → 周期性板块（可选消费、科技、汽车）受益。2025年3月零售销售环比增长1.5%，电子产品和家居用品领涨，直接提振了消费类ETF和指数。<sup>[9]</sup></p>
        <h4>2. 控制组零售销售</h4>
        <p>市场最关注的是"控制组"零售销售（剔除汽车、汽油、建材和食品服务），该指标直接纳入GDP核算中的商品消费部分，是GDP数据发布前最准确的消费预测参考。</p>
        <h4>3. 通胀调整后的解读</h4>
        <p>零售销售是名义值，包含价格变动。在通胀高企时期，零售销售增长可能被价格上涨"虚增"，实际消费量可能并未增长。因此需结合CPI对零售销售进行"通胀调整"后再做判断。</p>
        <div class="callout">
          <strong>关键洞察：</strong> 零售销售是就业状况和消费者信心的"最终兑现"——就业给消费者支付能力，信心给消费者支付意愿，零售销售则是两者的实际结果。三个指标的一致性方向是判断消费周期的关键。
        </div>
      </section>

      <!-- ===== 八、收益率曲线 ===== -->
      <section>
        <h2>八、收益率曲线（2Y-10Y利差）</h2>
        <h3>指标定义</h3>
        <p>收益率曲线衡量不同期限美国国债收益率之间的关系，最受关注的是2年期与10年期国债利差（10Y-2Y Spread）。正常状态下，长期收益率高于短期收益率（正利差）；当短期收益率高于长期收益率时（负利差），曲线"倒挂"，被视为衰退预警信号。<sup>[21]</sup></p>
        <h3>影响逻辑</h3>
        <h4>1. 衰退预测的"金标准"</h4>
        <p>美联储分析显示，自1969年以来，2Y-10Y利差转负后，美国经济在平均12-18个月内均出现衰退。<sup>[21]</sup> 2022-2025年的倒挂是美国历史上持续时间最长的一次，于2025年4月前后结束倒挂。<sup>[22]</sup></p>
        <h4>2. "解除倒挂"的危险信号</h4>
        <p>收益率曲线从倒挂回归正常有两种方式：<strong>"熊陡"</strong>（长期利率上升快于短期）和<strong>"牛陡"</strong>（短期利率下降快于长期）。2025年的解除倒挂属于"牛陡"——市场预期美联储将大幅降息以应对经济放缓，这本身是衰退担忧的体现。<sup>[22]</sup> 历史上，解除倒挂后往往伴随经济衰退的到来，而非风险的解除。</p>
        <h4>3. 板块轮动信号</h4>
        <p>收益率曲线陡峭化（正利差扩大）利好银行股（借短贷长，净息差扩大），同时也改变了成长股与价值股之间的相对表现。2025年"大正常化"过程中，价值股相对于成长股的表现显著改善。<sup>[23]</sup></p>
        <div class="callout accent2">
          <strong>关键洞察：</strong> 收益率曲线是市场集体智慧的结晶——它综合了市场对增长、通胀、货币政策的所有预期，可能是最"聪明"的单一宏观指标。但它提供的是"概率"而非"确定性"：倒挂预示衰退风险上升，但并非每一次倒挂都以衰退收场。
        </div>
      </section>

      <!-- ===== 九、综合影响力评估 ===== -->
      <section>
        <h2>九、8大指标综合影响力评估</h2>
        <figure class="chart-figure">
          <figcaption>图2：各经济指标对美股综合影响力评分</figcaption>
          <WeightBarChart />
        </figure>
        <p class="chart-note">评分综合考量了指标对估值的影响、对盈利的传导、领先性、市场关注度和单日波动触发能力五个维度。联邦基金利率和通胀位居前两位，合计解释力约60%。</p>
      </section>

      <!-- ===== 十、指标相互作用分析 ===== -->
      <section>
        <h2>十、指标相互作用与联动分析</h2>
        <p>单一指标的分析价值有限——<mark class="key">指标之间的相互作用往往比指标本身更重要</mark>。以下是8个指标之间最重要的联动关系：</p>
        <h3>10.1 核心传导链：通胀 → 利率 → 估值 → 股市</h3>
        <p>这是最重要的传导链条：通胀（CPI/PCE）超预期 → 美联储加息或维持高利率 → 无风险利率上升 → DCF估值模型分母增大 → 股票现值下降，尤其是高久期成长股。这条链条解释了为什么<strong>CPI发布日</strong>往往是美股波动最大的交易日之一。</p>
        <div class="flow-box">
          <template v-for="(node, idx) in flowChain1" :key="idx">
            <span class="node" :class="{ gold: node.gold }">{{ node.text }}</span>
            <span v-if="idx < flowChain1.length - 1" class="arrow">→</span>
          </template>
        </div>
        <h3>10.2 就业-消费-产出三角</h3>
        <p>就业、零售销售和GDP构成一个相互强化的正反馈三角：<mark class="key">就业增长 → 居民收入增加 → 消费支出（零售销售）上升 → 企业营收增长 → GDP扩张 → 企业扩大招聘 → 就业进一步增长。</mark> 反之，任何一个环节的松动都可能触发负反馈循环。</p>
        <div class="flow-box">
          <template v-for="(node, idx) in flowChain2" :key="idx">
            <span class="node" :class="{ gold: node.gold }">{{ node.text }}</span>
            <span v-if="idx < flowChain2.length - 1" class="arrow">→</span>
          </template>
        </div>
        <h3>10.3 制造业PMI与就业的领先-滞后关系</h3>
        <p>ISM制造业PMI的新订单分项是就业数据的领先指标（领先约3-6个月）。新订单萎缩 → 企业减少招聘 → 非农数据走弱。2026年ISM制造业PMI新订单指数56.8%持续扩张，但就业分项仅48.6%，这一"分化"表明制造业复苏尚不均衡，企业仍在谨慎控制人力成本。<sup>[17]</sup></p>
        <h3>10.4 消费者信心与零售销售的"软硬数据"验证</h3>
        <p>消费者信心是"软数据"，零售销售是"硬数据"。两者通常同向变动，但当出现背离时，往往蕴含重要信号：</p>
        <ul>
          <li><strong>信心高 + 销售低</strong>：消费者"想花但花不起"，实际购买力受通胀或债务约束，预示消费可能进一步走弱。</li>
          <li><strong>信心低 + 销售高</strong>：消费者"花得起但不想花"，可能是短期情绪冲击（如政治事件），销售韧性有望维持。</li>
        </ul>
        <h3>10.5 收益率曲线与其他指标的共振</h3>
        <p>收益率曲线本质上是对其他所有指标的综合定价：</p>
        <ul>
          <li><strong>通胀预期上升</strong> → 长期利率上升 → 曲线陡峭化</li>
          <li><strong>就业强劲 + 通胀高企</strong> → 短期利率（美联储政策利率）维持高位 → 曲线可能倒挂</li>
          <li><strong>PMI持续萎缩</strong> → 衰退预期上升 → 长期利率下降（避险买盘）→ 曲线可能倒挂</li>
          <li><strong>GDP增长放缓</strong> → 市场预期降息 → 短期利率下降 → 曲线陡峭化（牛陡）</li>
        </ul>
        <h3>10.6 指标传导关系全景图</h3>
        <figure class="chart-figure">
          <figcaption>图3：核心经济指标传导关系桑基图</figcaption>
          <SankeyChart />
        </figure>
        <p class="chart-note">桑基图展示了从原始指标（左侧）到最终美股走势（右侧）的传导路径和影响强度。线的粗细代表传导强度，可以看到两条最粗的路径分别通过"企业盈利"和"美股估值"最终影响美股走势。</p>
        <h3>10.7 宏观情境矩阵</h3>
        <p>综合8个指标的方向组合，可以构建以下宏观情境矩阵：</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>宏观情境</th><th>GDP</th><th>CPI</th><th>就业</th><th>利率</th><th>PMI</th><th>收益率曲线</th><th>美股影响</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>金发女孩</strong></td><td>温和增长</td><td>温和(≈2%)</td><td>稳定</td><td>稳定或微降</td><td>&gt;50</td><td>正常</td><td>全面利好，最优环境</td></tr>
              <tr><td><strong>过热</strong></td><td>高增长</td><td>高(>3%)</td><td>过热</td><td>加息</td><td>&gt;55</td><td>倒挂风险</td><td>成长股承压，价值/周期股受益</td></tr>
              <tr><td><strong>滞胀</strong></td><td>低/负增长</td><td>高(>3%)</td><td>恶化</td><td>两难</td><td>&lt;50</td><td>剧烈波动</td><td>全面利空，防御板块相对抗跌</td></tr>
              <tr><td><strong>衰退</strong></td><td>负增长</td><td>回落</td><td>恶化</td><td>降息</td><td>&lt;45</td><td>牛陡</td><td>利空已部分定价，关注拐点</td></tr>
              <tr><td><strong>复苏</strong></td><td>反弹</td><td>低位</td><td>改善</td><td>低利率</td><td>拐头向上</td><td>正常化</td><td>周期股领涨，成长股修复</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ===== 十一、投资启示 ===== -->
      <section>
        <h2>十一、综合投资启示</h2>
        <h3>11.1 指标优先级与观察节奏</h3>
        <p>根据指标对美股的<strong>即时影响强度</strong>和<strong>领先/滞后属性</strong>，建议按以下优先级跟踪：</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>优先级</th><th>指标</th><th>类型</th><th>关注重点</th><th>发布频率</th></tr></thead>
            <tbody>
              <tr><td><strong>第一梯队</strong></td><td>CPI/PCE</td><td>领先</td><td>与预期的偏差，核心通胀趋势</td><td>月度</td></tr>
              <tr><td><strong>第一梯队</strong></td><td>联邦基金利率/FOMC</td><td>政策变量</td><td>点阵图、前瞻指引措辞变化</td><td>8次/年</td></tr>
              <tr><td><strong>第一梯队</strong></td><td>非农就业</td><td>同步</td><td>新增人数、失业率、平均时薪</td><td>月度</td></tr>
              <tr><td><strong>第二梯队</strong></td><td>ISM PMI</td><td>领先</td><td>新订单、物价支付分项</td><td>月度</td></tr>
              <tr><td><strong>第二梯队</strong></td><td>零售销售</td><td>同步</td><td>控制组数据，环比趋势</td><td>月度</td></tr>
              <tr><td><strong>第二梯队</strong></td><td>收益率曲线</td><td>领先</td><td>2Y-10Y利差方向和变化速度</td><td>每日</td></tr>
              <tr><td><strong>第三梯队</strong></td><td>GDP</td><td>滞后</td><td>趋势确认，GDPNow实时预测</td><td>季度</td></tr>
              <tr><td><strong>第三梯队</strong></td><td>消费者信心</td><td>领先</td><td>与硬数据的交叉验证</td><td>月度</td></tr>
            </tbody>
          </table>
        </div>
        <h3>11.2 核心原则</h3>
        <p><strong>1. 预期差比绝对值更重要。</strong> 市场定价的是"预期差"——数据超预期或低于预期的幅度，而非数据的绝对水平。一个"差但好于预期"的数据可能比"好但不及预期"的数据带来更大的市场上涨。</p>
        <p><strong>2. 情景比预测更重要。</strong> 与其预测单一指标走向，不如构建"指标组合"的情景矩阵（如9.6节所示），根据数据变化动态调整概率权重。</p>
        <p><strong>3. 关注"交叉验证"而非"单一确认"。</strong> 所有指标都有噪声和修正。当多个不同维度的指标给出同一方向信号时，该趋势的可靠性显著增强。当软数据和硬数据方向背离时，需保持警惕。</p>
        <p><strong>4. 利率是定价之锚。</strong> 无论分析哪个指标，最终的落脚点应回到"这一数据如何影响美联储利率路径预期"。在当前的宏观环境下，美联储政策预期是美股定价的核心锚点。</p>
        <p><strong>5. 周期位置决定指标敏感度。</strong> 同一指标在不同周期阶段的市场影响力不同。在加息周期末期，就业数据的影响力可能超过通胀；在降息周期初期，通胀数据可能重新成为焦点。</p>
      </section>

      <!-- ===== 十二、结论 ===== -->
      <section>
        <h2>十二、结论</h2>
        <p>影响美股走势的8个核心经济指标——<strong>联邦基金利率、通胀（CPI/PCE）、就业数据、GDP、ISM PMI、消费者信心、零售销售和收益率曲线</strong>——各自通过不同的传导渠道影响股市，但真正的威力在于它们之间的相互作用和共振。</p>
        <p>这些指标构成了一个<strong>多层次的宏观分析体系</strong>：利率和通胀决定估值基准，就业和消费决定盈利基本面，PMI和收益率曲线提供前瞻信号，GDP提供趋势确认。理解这一体系，意味着能够在数据发布时快速判断其市场含义，而非简单跟随市场的第一反应。</p>
        <p>在当前（2026年中）的宏观环境下，市场正处于<strong>通胀回落但尚未达标、就业温和放缓、利率高位维持、制造业复苏但就业分项疲软</strong>的复杂格局中。指标之间的"分化"本身就是最重要的信号——它意味着市场定价的不确定性高，方向性押注的风险加大，密切关注指标联动和预期差的变化将是应对这一环境的核心策略。</p>
      </section>
    </main>

    <!-- ========== 引用来源 ========== -->
    <footer>
      <div class="container sources">
        <h2>Sources</h2>
        <ol>
          <li v-for="src in sources" :key="src.id" :id="`cite-${src.id}`">
            <span class="src-title">{{ src.title }}</span>
            <a class="src-url" :href="src.url" target="_blank" rel="noopener">{{ src.url }}</a>
          </li>
        </ol>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* CSS 变量与原 HTML 报告一致 */
.economic-report {
  --bg: #f9f9f6;
  --bg2: #ffffff;
  --ink: #1a1a2e;
  --muted: #6b7280;
  --rule: #d1d5db;
  --accent: #1e3a5f;
  --accent2: #b8860b;
  font-size: 16px;
  line-height: 1.75;
  color: var(--ink);
}

/* ---- Hero ---- */
.hero {
  background: var(--accent);
  color: #fff;
  padding: 5rem 1.5rem 4rem;
  text-align: center;
  border-bottom: 4px solid var(--accent2);
}
.hero h1 {
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.3;
  max-width: 720px;
  margin: 0 auto 1rem;
  letter-spacing: -0.01em;
}
.hero .subtitle {
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.75);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}
.hero .meta {
  margin-top: 1.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.55);
}

/* ---- 主内容容器 ---- */
.container {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
main {
  padding: 3rem 0;
}
section {
  margin-bottom: 3.5rem;
}

/* ---- 标题 ---- */
h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 0.3rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent2);
  letter-spacing: -0.005em;
}
h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
  margin: 1.5rem 0 0.6rem;
}
h4 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
  margin: 1.2rem 0 0.5rem;
}
p {
  margin-bottom: 0.9rem;
}
mark.key {
  background: none;
  color: var(--accent2);
  font-weight: 600;
}
sup {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--accent);
}
ul {
  padding-left: 1.5rem;
  margin-bottom: 0.9rem;
}
li {
  margin-bottom: 0.4rem;
}

/* ---- Callout 提示框 ---- */
.callout {
  background: var(--bg2);
  border-left: 4px solid var(--accent);
  padding: 1.2rem 1.5rem;
  margin: 1.5rem 0;
  border-radius: 0 4px 4px 0;
  font-size: 0.95rem;
}
.callout.accent2 {
  border-left-color: var(--accent2);
}
.callout strong {
  color: var(--accent);
}

/* ---- 图表容器 ---- */
.chart-figure {
  margin: 2rem 0;
}
.chart-figure figcaption {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 0.75rem;
}
.chart-note {
  font-size: 0.85rem;
  color: var(--muted);
  margin-top: 0.5rem;
}

/* ---- 静态指标小卡片（通胀章节内） ---- */
.metric-grid-static {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin: 1.5rem 0;
}
.metric-card-static {
  background: var(--bg2);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 1.25rem;
  text-align: center;
}
.metric-card-static .val {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent);
}
.metric-card-static .lbl {
  font-size: 0.82rem;
  color: var(--muted);
  margin-top: 0.3rem;
}

/* ---- 表格 ---- */
.table-wrap {
  overflow-x: auto;
  margin: 1.5rem 0;
  border: 1px solid var(--rule);
  border-radius: 6px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th {
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  padding: 0.7rem 0.9rem;
  text-align: left;
  white-space: nowrap;
}
td {
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--rule);
}
tr:last-child td {
  border-bottom: none;
}
tr:nth-child(even) td {
  background: var(--bg);
}

/* ---- 流程图 ---- */
.flow-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1.5rem 0;
  padding: 1.25rem;
  background: var(--bg2);
  border: 1px solid var(--rule);
  border-radius: 6px;
  font-size: 0.85rem;
}
.flow-box .node {
  background: var(--accent);
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  font-weight: 700;
  white-space: nowrap;
}
.flow-box .node.gold {
  background: var(--accent2);
}
.flow-box .arrow {
  color: var(--muted);
  font-size: 1.2rem;
}

/* ---- 引用来源 ---- */
footer {
  margin-top: 4rem;
  padding: 2rem 1.5rem;
  border-top: 1px solid var(--rule);
  background: var(--bg2);
}
footer .sources h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--rule);
}
footer .sources ol {
  padding-left: 1.2rem;
  font-size: 0.85rem;
  color: var(--muted);
}
footer .sources li {
  margin-bottom: 0.5rem;
  overflow-wrap: break-word;
  word-break: break-all;
}
footer .sources .src-title {
  color: var(--ink);
  word-break: normal;
}
footer .sources .src-url {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.82rem;
  color: var(--accent);
  word-break: break-all;
}
footer .sources a {
  word-break: break-all;
}

/* ---- 响应式 ---- */
@media (max-width: 600px) {
  .hero h1 {
    font-size: 1.6rem;
  }
  .metric-grid-static {
    grid-template-columns: 1fr;
  }
  .flow-box {
    flex-direction: column;
  }
  .flow-box .arrow {
    transform: rotate(90deg);
  }
  .economic-report {
    font-size: 15px;
  }
}
</style>
