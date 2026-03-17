/**
 * Investment Intelligence Library
 *
 * Fetches, normalises, and caches financial intelligence data from multiple
 * free, no-key-required data sources:
 *
 *  ┌─────────────────────────────────────────────────────────────────────────┐
 *  │  Source               │ Used for                                        │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │  Yahoo Finance v10    │ Analyst targets, recommendations, upgrade/       │
 *  │  quoteSummary         │ downgrade history, earnings estimates,           │
 *  │                       │ fundamentals (PE, margins, beta, market cap)     │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │  CoinGecko (free)     │ Crypto market data, ATH/ATL, 7d/30d/1y returns, │
 *  │                       │ community sentiment, developer activity          │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │  Alternative.me       │ Crypto Fear & Greed Index (last 7 days)         │
 *  └─────────────────────────────────────────────────────────────────────────┘
 *
 * All functions are resilient: they return null/empty on failure rather than
 * throwing. The cache (30-min TTL) prevents hammering external APIs on every
 * dashboard load.
 *
 * IMPORTANT: Do NOT import in client components — this is server-only.
 */

import axios from 'axios'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RecommendationTrend {
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
  total: number
}

export interface AnalystAction {
  firm: string
  /** 'up' | 'down' | 'init' | 'reit' as returned by Yahoo */
  action: string
  fromGrade: string
  toGrade: string
  date: string // ISO string
}

export interface EarningsEstimate {
  /** '0q' = current quarter, '+1q' = next quarter, '0y' = current year, '+1y' = next year */
  period: string
  endDate: string
  growthEstimate: number | null
  epsEstimate: number | null
  epsActual: number | null
  numberOfAnalysts: number | null
}

export interface InsiderTransaction {
  /** Person's name */
  name: string
  /** Role, e.g. "CEO", "Director", "10% Owner" */
  relation: string
  /** e.g. "Sale", "Purchase", "Option Exercise" */
  transactionDescription: string
  startDate: string // ISO string
  shares: number | null
  /** USD value of the transaction */
  value: number | null
  /** Shares owned after transaction */
  ownership: number | null
}

export interface InstitutionalHolder {
  organization: string
  /** % of float held as 0-100 */
  pctHeld: number | null
  shares: number | null
  /** USD value of the position */
  value: number | null
  dateReported: string | null
}

export interface MajorHolders {
  /** % of shares held by all insiders */
  insidersHeldPct: number | null
  /** % of shares held by institutions */
  institutionsHeldPct: number | null
  /** % of float held by institutions */
  institutionsFloatHeldPct: number | null
  institutionsCount: number | null
}

export interface StockIntelligence {
  symbol: string
  name: string
  exchange: string
  currency: string

  // ── Analyst price targets ──────────────────────────────────────────────────
  currentPrice: number
  targetHigh: number | null
  targetLow: number | null
  targetMean: number | null
  targetMedian: number | null
  /** % upside to consensus mean price target (positive = upside, negative = downside) */
  upsideMean: number | null
  upsideHigh: number | null
  upsideLow: number | null

  // ── Consensus ─────────────────────────────────────────────────────────────
  /** 'strongBuy' | 'buy' | 'hold' | 'underperform' | 'sell' | 'none' */
  recommendationKey: string
  /** Human-readable label e.g. "Strong Buy" */
  recommendationLabel: string
  /** 1 = Strong Buy … 5 = Strong Sell */
  recommendationMean: number | null
  analystCount: number

  // ── Recommendation breakdown ───────────────────────────────────────────────
  /** Current month breakdown from recommendationTrend */
  currentTrend: RecommendationTrend | null
  /** Previous month breakdown (for trend comparison) */
  previousMonthTrend: RecommendationTrend | null

  // ── Recent upgrades / downgrades (up to 8 most recent) ────────────────────
  recentActions: AnalystAction[]

  // ── Earnings ──────────────────────────────────────────────────────────────
  /** EPS growth estimate for current fiscal year */
  earningsGrowthCurrentYear: number | null
  /** EPS growth estimate for next fiscal year */
  earningsGrowthNextYear: number | null
  revenueGrowth: number | null
  earningsEstimates: EarningsEstimate[]

  // ── Valuation ─────────────────────────────────────────────────────────────
  trailingPE: number | null
  forwardPE: number | null
  priceToBook: number | null
  priceToSales: number | null
  evToEbitda: number | null
  beta: number | null
  marketCap: number | null
  dividendYield: number | null

  // ── Price range ───────────────────────────────────────────────────────────
  week52High: number | null
  week52Low: number | null
  /** How far current price is below 52-week high (negative %) */
  week52HighPercent: number | null
  /** How far current price is above 52-week low (positive %) */
  week52LowPercent: number | null

  // ── Profitability ─────────────────────────────────────────────────────────
  grossMargins: number | null
  operatingMargins: number | null
  profitMargins: number | null
  returnOnEquity: number | null
  returnOnAssets: number | null

  // ── Financial health ──────────────────────────────────────────────────────
  debtToEquity: number | null
  currentRatio: number | null

  // ── Insider & institutional ownership ─────────────────────────────────────
  insiderTransactions: InsiderTransaction[]
  topInstitutionalHolders: InstitutionalHolder[]
  majorHolders: MajorHolders | null

  fetchedAt: string
  source: 'yahoo'
  /** Set if Yahoo returned data but some fields were unavailable */
  dataQuality: 'full' | 'partial' | 'price_only'
  error?: string
}

export interface CryptoIntelligence {
  symbol: string
  name: string
  coinId: string
  currentPrice: number

  // ── Market position ───────────────────────────────────────────────────────
  marketCapRank: number | null
  marketCap: number | null
  totalVolume: number | null

  // ── Price performance ─────────────────────────────────────────────────────
  priceChange24h: number | null
  priceChange7d: number | null
  priceChange30d: number | null
  priceChange1y: number | null

  // ── All-time extremes ─────────────────────────────────────────────────────
  ath: number | null
  athDate: string | null
  /** % below all-time high (negative value) */
  athChangePercent: number | null
  atl: number | null
  atlDate: string | null
  /** % above all-time low (positive value) */
  atlChangePercent: number | null

  // ── Community / sentiment ─────────────────────────────────────────────────
  /** 0–100 */
  sentimentVotesUp: number | null
  sentimentVotesDown: number | null
  twitterFollowers: number | null
  redditSubscribers: number | null
  redditActiveAccounts: number | null

  // ── Developer activity ────────────────────────────────────────────────────
  githubStars: number | null
  githubCommits4w: number | null

  fetchedAt: string
  source: 'coingecko'
  error?: string
}

export interface FearGreedReading {
  value: number
  /** e.g. "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed" */
  classification: string
  date: string // ISO string
}

export interface FearGreedIndex {
  current: FearGreedReading
  yesterday: FearGreedReading | null
  lastWeek: FearGreedReading | null
  /** Last 7 readings oldest→newest */
  history: FearGreedReading[]
}

export interface PortfolioIntelligence {
  stocks: Record<string, StockIntelligence>
  crypto: Record<string, CryptoIntelligence>
  fearGreed: FearGreedIndex | null
  fetchedAt: string
  errors: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache (30-minute TTL, keyed by symbol or 'feargreed')
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000

interface CacheEntry<T> {
  data: T
  expiry: number
}

const stockCache = new Map<string, CacheEntry<StockIntelligence>>()
const cryptoCache = new Map<string, CacheEntry<CryptoIntelligence>>()
let fearGreedCache: CacheEntry<FearGreedIndex> | null = null

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() < entry.expiry) return entry.data
  return null
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function raw(obj: unknown): number | null {
  if (obj === null || obj === undefined) return null
  if (typeof obj === 'object' && obj !== null && 'raw' in obj) {
    const v = (obj as Record<string, unknown>).raw
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  if (typeof obj === 'number' && Number.isFinite(obj)) return obj
  return null
}

function pct(val: number | null): number | null {
  if (val === null) return null
  return Math.round(val * 10000) / 100 // e.g. 0.1234 → 12.34
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strongBuy: 'Strong Buy',
  buy: 'Buy',
  hold: 'Hold',
  underperform: 'Underperform',
  sell: 'Sell',
  none: 'No Rating',
}

// CoinGecko ID mapping — extend as needed
const COIN_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  LTC: 'litecoin',
  TRX: 'tron',
  SHIB: 'shiba-inu',
}

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance — Stock Intelligence
// ─────────────────────────────────────────────────────────────────────────────

const YAHOO_MODULES = [
  'financialData',
  'recommendationTrend',
  'upgradeDowngradeHistory',
  'earningsTrend',
  'summaryDetail',
  'quoteType',
  'insiderTransactions',
  'majorHoldersBreakdown',
  'institutionOwnership',
].join(',')

async function yahooQuoteSummary(ticker: string): Promise<Record<string, unknown> | null> {
  const path = `/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${YAHOO_MODULES}`
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  const timeout = 7000

  // Try query1 first, fall back to query2
  for (const domain of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const response = await axios.get(`https://${domain}${path}`, { timeout, headers })
      const result = response.data?.quoteSummary?.result?.[0]
      if (result && typeof result === 'object') return result as Record<string, unknown>
    } catch {
      // Try next domain
    }
  }
  return null
}

function extractRecommendationTrend(trendData: unknown): RecommendationTrend | null {
  if (!trendData || typeof trendData !== 'object') return null
  const d = trendData as Record<string, unknown>
  const strongBuy = typeof d.strongBuy === 'number' ? d.strongBuy : 0
  const buy = typeof d.buy === 'number' ? d.buy : 0
  const hold = typeof d.hold === 'number' ? d.hold : 0
  const sell = typeof d.sell === 'number' ? d.sell : 0
  const strongSell = typeof d.strongSell === 'number' ? d.strongSell : 0
  const total = strongBuy + buy + hold + sell + strongSell
  if (total === 0) return null
  return { strongBuy, buy, hold, sell, strongSell, total }
}

function extractAnalystActions(historyData: unknown): AnalystAction[] {
  if (!Array.isArray(historyData)) return []
  return historyData
    .slice(0, 8)
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const d = item as Record<string, unknown>
      const epochDate = typeof d.epochGradeDate === 'number' ? d.epochGradeDate * 1000 : Date.now()
      return {
        firm: typeof d.firm === 'string' ? d.firm : 'Unknown',
        action: typeof d.action === 'string' ? d.action : '',
        fromGrade: typeof d.fromGrade === 'string' ? d.fromGrade : '',
        toGrade: typeof d.toGrade === 'string' ? d.toGrade : '',
        date: new Date(epochDate).toISOString(),
      }
    })
    .filter((a): a is AnalystAction => a !== null)
}

function extractEarningsEstimates(trendsData: unknown): EarningsEstimate[] {
  if (!Array.isArray(trendsData)) return []
  return trendsData.map((item: unknown) => {
    if (!item || typeof item !== 'object') {
      return { period: '', endDate: '', growthEstimate: null, epsEstimate: null, epsActual: null, numberOfAnalysts: null }
    }
    const d = item as Record<string, unknown>
    const ee = d.earningsEstimate as Record<string, unknown> | undefined
    return {
      period: typeof d.period === 'string' ? d.period : '',
      endDate: typeof d.endDate === 'string' ? d.endDate : '',
      growthEstimate: raw(d.growth),
      epsEstimate: ee ? raw(ee.avg) : null,
      epsActual: ee ? raw(ee.yearAgoEps) : null,
      numberOfAnalysts: ee && typeof (ee as Record<string, unknown>).numberOfAnalysts === 'object'
        ? raw((ee as Record<string, unknown>).numberOfAnalysts)
        : null,
    }
  })
}

function extractInsiderTransactions(data: unknown): InsiderTransaction[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const transactions = Array.isArray(d.transactions) ? d.transactions : []
  return (transactions as unknown[])
    .slice(0, 10)
    .map((item: unknown): InsiderTransaction | null => {
      if (!item || typeof item !== 'object') return null
      const t = item as Record<string, unknown>
      const epochDate = typeof t.startDate === 'object' && t.startDate !== null
        ? raw((t.startDate as Record<string, unknown>).raw)
        : typeof t.startDate === 'number' ? t.startDate : null
      return {
        name: typeof t.filerName === 'string' ? t.filerName : 'Unknown',
        relation: typeof t.filerRelation === 'string' ? t.filerRelation : '',
        transactionDescription: typeof t.transactionDescription === 'string' ? t.transactionDescription : '',
        startDate: epochDate !== null ? new Date(epochDate * 1000).toISOString() : new Date().toISOString(),
        shares: raw(t.shares),
        value: raw(t.value),
        ownership: raw(t.ownership),
      }
    })
    .filter((t): t is InsiderTransaction => t !== null)
}

function extractInstitutionalHolders(data: unknown): InstitutionalHolder[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const holders = Array.isArray(d.institutionOwnership) ? d.institutionOwnership : []
  return (holders as unknown[])
    .slice(0, 10)
    .map((item: unknown): InstitutionalHolder | null => {
      if (!item || typeof item !== 'object') return null
      const h = item as Record<string, unknown>
      const dateRaw = typeof h.reportDate === 'object' && h.reportDate !== null
        ? raw((h.reportDate as Record<string, unknown>).raw)
        : null
      return {
        organization: typeof h.organization === 'string' ? h.organization : 'Unknown',
        pctHeld: raw(h.pctHeld) !== null ? Math.round((raw(h.pctHeld) as number) * 10000) / 100 : null,
        shares: raw(h.position),
        value: raw(h.value),
        dateReported: dateRaw !== null ? new Date(dateRaw * 1000).toISOString() : null,
      }
    })
    .filter((h): h is InstitutionalHolder => h !== null)
}

function extractMajorHolders(data: unknown): MajorHolders | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    insidersHeldPct: raw(d.insidersPercentHeld) !== null
      ? Math.round((raw(d.insidersPercentHeld) as number) * 10000) / 100 : null,
    institutionsHeldPct: raw(d.institutionsPercentHeld) !== null
      ? Math.round((raw(d.institutionsPercentHeld) as number) * 10000) / 100 : null,
    institutionsFloatHeldPct: raw(d.institutionsFloatPercentHeld) !== null
      ? Math.round((raw(d.institutionsFloatPercentHeld) as number) * 10000) / 100 : null,
    institutionsCount: raw(d.institutionsCount),
  }
}

export async function fetchStockIntelligence(symbol: string): Promise<StockIntelligence | null> {
  const cacheKey = symbol.toUpperCase()
  const cached = getCached(stockCache, cacheKey)
  if (cached) return cached

  // For TASE stocks without a suffix, try plain first then .TA
  const tickers = symbol.includes('.') ? [symbol] : [symbol, `${symbol}.TA`]

  for (const ticker of tickers) {
    const result = await yahooQuoteSummary(ticker)
    if (!result) continue

    const fd = result.financialData as Record<string, unknown> | undefined
    const rt = result.recommendationTrend as Record<string, unknown> | undefined
    const udh = result.upgradeDowngradeHistory as Record<string, unknown> | undefined
    const et = result.earningsTrend as Record<string, unknown> | undefined
    const sd = result.summaryDetail as Record<string, unknown> | undefined
    const qt = result.quoteType as Record<string, unknown> | undefined
    const it = result.insiderTransactions as Record<string, unknown> | undefined
    const io = result.institutionOwnership as Record<string, unknown> | undefined
    const mh = result.majorHoldersBreakdown as Record<string, unknown> | undefined

    const currentPrice = raw(fd?.currentPrice) ?? 0
    const targetMean = raw(fd?.targetMeanPrice)
    const targetHigh = raw(fd?.targetHighPrice)
    const targetLow = raw(fd?.targetLowPrice)
    const targetMedian = raw(fd?.targetMedianPrice)

    const upsideMean = targetMean !== null && currentPrice > 0
      ? Math.round(((targetMean - currentPrice) / currentPrice) * 10000) / 100
      : null
    const upsideHigh = targetHigh !== null && currentPrice > 0
      ? Math.round(((targetHigh - currentPrice) / currentPrice) * 10000) / 100
      : null
    const upsideLow = targetLow !== null && currentPrice > 0
      ? Math.round(((targetLow - currentPrice) / currentPrice) * 10000) / 100
      : null

    const recommendationKey = typeof fd?.recommendationKey === 'string'
      ? fd.recommendationKey : 'none'

    const week52High = raw(sd?.fiftyTwoWeekHigh)
    const week52Low = raw(sd?.fiftyTwoWeekLow)
    const week52HighPercent = week52High !== null && week52High > 0 && currentPrice > 0
      ? Math.round(((currentPrice - week52High) / week52High) * 10000) / 100
      : null
    const week52LowPercent = week52Low !== null && week52Low > 0 && currentPrice > 0
      ? Math.round(((currentPrice - week52Low) / week52Low) * 10000) / 100
      : null

    // Recommendation trends
    const trendList = Array.isArray(rt?.trend) ? rt!.trend as unknown[] : []
    const currentTrend = extractRecommendationTrend(trendList[0])
    const previousMonthTrend = extractRecommendationTrend(trendList[1])

    // Analyst actions history
    const actionHistory = Array.isArray(udh?.history) ? udh!.history : []
    const recentActions = extractAnalystActions(actionHistory)

    // Earnings trend
    const earningsTrendList = Array.isArray(et?.trend) ? et!.trend : []
    const earningsEstimates = extractEarningsEstimates(earningsTrendList)
    const yearlyEstimates = earningsEstimates.filter((e) => e.period === '0y' || e.period === '+1y')
    const earningsGrowthCurrentYear = yearlyEstimates.find((e) => e.period === '0y')?.growthEstimate ?? null
    const earningsGrowthNextYear = yearlyEstimates.find((e) => e.period === '+1y')?.growthEstimate ?? null

    // Insider transactions
    const insiderTransactions = extractInsiderTransactions(it)

    // Institutional ownership
    const institutionList = io && Array.isArray(io.ownershipList) ? { institutionOwnership: io.ownershipList } : io
    const topInstitutionalHolders = extractInstitutionalHolders(institutionList)

    // Major holders breakdown
    const majorHolders = extractMajorHolders(mh)

    // Determine data quality
    const dataQuality: StockIntelligence['dataQuality'] =
      targetMean !== null && currentTrend !== null ? 'full'
      : targetMean !== null || currentTrend !== null ? 'partial'
      : 'price_only'

    const intelligence: StockIntelligence = {
      symbol,
      name: typeof qt?.longName === 'string' ? qt.longName
        : typeof qt?.shortName === 'string' ? qt.shortName
        : symbol,
      exchange: typeof qt?.exchange === 'string' ? qt.exchange : '',
      currency: typeof qt?.currency === 'string' ? qt.currency
        : typeof sd?.currency === 'string' ? sd.currency as string : 'USD',

      currentPrice,
      targetHigh,
      targetLow,
      targetMean,
      targetMedian,
      upsideMean,
      upsideHigh,
      upsideLow,

      recommendationKey,
      recommendationLabel: RECOMMENDATION_LABELS[recommendationKey] ?? recommendationKey,
      recommendationMean: raw(fd?.recommendationMean),
      analystCount: raw(fd?.numberOfAnalystOpinions) ?? 0,

      currentTrend,
      previousMonthTrend,
      recentActions,

      earningsGrowthCurrentYear: pct(earningsGrowthCurrentYear),
      earningsGrowthNextYear: pct(earningsGrowthNextYear),
      revenueGrowth: pct(raw(fd?.revenueGrowth)),
      earningsEstimates,

      trailingPE: raw(sd?.trailingPE),
      forwardPE: raw(fd?.currentPrice) !== null ? raw(sd?.forwardPE) : null,
      priceToBook: raw(sd?.priceToBook),
      priceToSales: raw(sd?.priceToSalesTrailing12Months),
      evToEbitda: raw(sd?.enterpriseToEbitda),
      beta: raw(sd?.beta),
      marketCap: raw(sd?.marketCap),
      dividendYield: pct(raw(sd?.dividendYield)),

      week52High,
      week52Low,
      week52HighPercent,
      week52LowPercent,

      grossMargins: pct(raw(fd?.grossMargins)),
      operatingMargins: pct(raw(fd?.operatingMargins)),
      profitMargins: pct(raw(fd?.profitMargins)),
      returnOnEquity: pct(raw(fd?.returnOnEquity)),
      returnOnAssets: pct(raw(fd?.returnOnAssets)),

      debtToEquity: raw(fd?.debtToEquity),
      currentRatio: raw(fd?.currentRatio),

      insiderTransactions,
      topInstitutionalHolders,
      majorHolders,

      fetchedAt: new Date().toISOString(),
      source: 'yahoo',
      dataQuality,
    }

    setCached(stockCache, cacheKey, intelligence)
    return intelligence
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// CoinGecko — Crypto Intelligence
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCryptoIntelligence(symbol: string): Promise<CryptoIntelligence | null> {
  const cacheKey = symbol.toUpperCase()
  const cached = getCached(cryptoCache, cacheKey)
  if (cached) return cached

  const coinId = COIN_ID_MAP[cacheKey]
  if (!coinId) return null

  try {
    const url =
      `https://api.coingecko.com/api/v3/coins/${coinId}` +
      `?localization=false&tickers=false&market_data=true` +
      `&community_data=true&developer_data=true&sparkline=false`

    const response = await axios.get(url, {
      timeout: 8000,
      headers: { Accept: 'application/json' },
    })

    const d = response.data as Record<string, unknown>
    const md = (d.market_data ?? {}) as Record<string, unknown>
    const cd = (d.community_data ?? {}) as Record<string, unknown>
    const dd = (d.developer_data ?? {}) as Record<string, unknown>

    function getLocale(obj: unknown): number | null {
      if (!obj || typeof obj !== 'object') return null
      const o = obj as Record<string, unknown>
      const v = o.usd ?? o.ils ?? Object.values(o)[0]
      return typeof v === 'number' ? v : null
    }

    const currentPrice = getLocale(md.current_price) ?? 0

    const intelligence: CryptoIntelligence = {
      symbol,
      name: typeof d.name === 'string' ? d.name : symbol,
      coinId,
      currentPrice,

      marketCapRank: typeof d.market_cap_rank === 'number' ? d.market_cap_rank : null,
      marketCap: getLocale(md.market_cap),
      totalVolume: getLocale(md.total_volume),

      priceChange24h: typeof (md.price_change_percentage_24h) === 'number'
        ? Math.round((md.price_change_percentage_24h as number) * 100) / 100 : null,
      priceChange7d: typeof (md.price_change_percentage_7d) === 'number'
        ? Math.round((md.price_change_percentage_7d as number) * 100) / 100 : null,
      priceChange30d: typeof (md.price_change_percentage_30d) === 'number'
        ? Math.round((md.price_change_percentage_30d as number) * 100) / 100 : null,
      priceChange1y: typeof (md.price_change_percentage_1y) === 'number'
        ? Math.round((md.price_change_percentage_1y as number) * 100) / 100 : null,

      ath: getLocale(md.ath),
      athDate: typeof ((md.ath_date as Record<string, unknown>)?.usd) === 'string'
        ? (md.ath_date as Record<string, unknown>).usd as string : null,
      athChangePercent: typeof ((md.ath_change_percentage as Record<string, unknown>)?.usd) === 'number'
        ? Math.round(((md.ath_change_percentage as Record<string, unknown>).usd as number) * 100) / 100 : null,

      atl: getLocale(md.atl),
      atlDate: typeof ((md.atl_date as Record<string, unknown>)?.usd) === 'string'
        ? (md.atl_date as Record<string, unknown>).usd as string : null,
      atlChangePercent: typeof ((md.atl_change_percentage as Record<string, unknown>)?.usd) === 'number'
        ? Math.round(((md.atl_change_percentage as Record<string, unknown>).usd as number) * 100) / 100 : null,

      sentimentVotesUp: typeof d.sentiment_votes_up_percentage === 'number'
        ? Math.round((d.sentiment_votes_up_percentage as number) * 10) / 10 : null,
      sentimentVotesDown: typeof d.sentiment_votes_down_percentage === 'number'
        ? Math.round((d.sentiment_votes_down_percentage as number) * 10) / 10 : null,
      twitterFollowers: typeof cd.twitter_followers === 'number' ? cd.twitter_followers as number : null,
      redditSubscribers: typeof cd.reddit_subscribers === 'number' ? cd.reddit_subscribers as number : null,
      redditActiveAccounts: typeof cd.reddit_accounts_active_48h === 'number'
        ? cd.reddit_accounts_active_48h as number : null,

      githubStars: typeof dd.stars === 'number' ? dd.stars as number : null,
      githubCommits4w: typeof dd.commit_count_4_weeks === 'number' ? dd.commit_count_4_weeks as number : null,

      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
    }

    setCached(cryptoCache, cacheKey, intelligence)
    return intelligence
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return {
      symbol,
      name: symbol,
      coinId,
      currentPrice: 0,
      marketCapRank: null,
      marketCap: null,
      totalVolume: null,
      priceChange24h: null,
      priceChange7d: null,
      priceChange30d: null,
      priceChange1y: null,
      ath: null,
      athDate: null,
      athChangePercent: null,
      atl: null,
      atlDate: null,
      atlChangePercent: null,
      sentimentVotesUp: null,
      sentimentVotesDown: null,
      twitterFollowers: null,
      redditSubscribers: null,
      redditActiveAccounts: null,
      githubStars: null,
      githubCommits4w: null,
      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
      error,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternative.me — Fear & Greed Index
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFearGreedIndex(): Promise<FearGreedIndex | null> {
  if (fearGreedCache && Date.now() < fearGreedCache.expiry) return fearGreedCache.data

  try {
    const response = await axios.get('https://api.alternative.me/fng/?limit=7', {
      timeout: 5000,
      headers: { Accept: 'application/json' },
    })

    const readings: FearGreedReading[] = (response.data?.data ?? []).map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const d = item as Record<string, unknown>
      return {
        value: parseInt(String(d.value), 10),
        classification: typeof d.value_classification === 'string' ? d.value_classification : '',
        date: typeof d.timestamp === 'string'
          ? new Date(parseInt(d.timestamp, 10) * 1000).toISOString()
          : new Date().toISOString(),
      }
    }).filter(Boolean)

    if (readings.length === 0) return null

    // API returns newest first
    const result: FearGreedIndex = {
      current: readings[0],
      yesterday: readings[1] ?? null,
      lastWeek: readings[6] ?? null,
      history: [...readings].reverse(), // oldest → newest
    }

    fearGreedCache = { data: result, expiry: Date.now() + CACHE_TTL_MS }
    return result
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio-level batch fetch
// ─────────────────────────────────────────────────────────────────────────────

const CRYPTO_SYMBOLS = new Set(Object.keys(COIN_ID_MAP))

function isCrypto(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(symbol.toUpperCase())
}

/**
 * Fetches investment intelligence for a list of symbols.
 * Symbols are automatically routed to Yahoo (stocks) or CoinGecko (crypto).
 * All fetches run concurrently with a small delay between batches.
 */
export async function fetchPortfolioIntelligence(
  symbols: string[]
): Promise<PortfolioIntelligence> {
  const stockSymbols = symbols.filter((s) => !isCrypto(s) && s !== 'ILS_CASH')
  const cryptoSymbols = symbols.filter((s) => isCrypto(s))
  const errors: string[] = []

  // Fetch in batches of 3 to avoid rate limiting
  const batchedFetch = async <T>(
    items: string[],
    fetcher: (s: string) => Promise<T | null>,
    label: string
  ): Promise<[string, T][]> => {
    const results: [string, T][] = []
    const batchSize = 3
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const settled = await Promise.allSettled(batch.map((s) => fetcher(s)))
      settled.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value !== null) {
          results.push([batch[idx].toUpperCase(), r.value])
        } else if (r.status === 'rejected') {
          errors.push(`${label} ${batch[idx]}: ${r.reason}`)
        }
      })
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    return results
  }

  const [stockResults, cryptoResults, fearGreed] = await Promise.all([
    batchedFetch(stockSymbols, fetchStockIntelligence, 'stock'),
    batchedFetch(cryptoSymbols, fetchCryptoIntelligence, 'crypto'),
    fetchFearGreedIndex(),
  ])

  return {
    stocks: Object.fromEntries(stockResults),
    crypto: Object.fromEntries(cryptoResults),
    fearGreed,
    fetchedAt: new Date().toISOString(),
    errors,
  }
}
