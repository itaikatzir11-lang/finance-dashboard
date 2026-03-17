/**
 * GET /api/forecasts
 *
 * Returns comprehensive analyst intelligence for all held stocks/ETFs/crypto.
 *
 * For stocks & ETFs — Yahoo Finance v10 quoteSummary:
 *   • Analyst consensus (Strong Buy → Sell) with analyst count
 *   • Price targets: mean, high, low, median + % upside to each
 *   • Recommendation breakdown by strength (current month vs last month)
 *   • Recent upgrade/downgrade history from named investment houses
 *   • Earnings growth estimates (current year, next year)
 *   • Fundamental ratios: P/E, forward P/E, P/B, EV/EBITDA, beta
 *   • Profit margins, ROE, debt-to-equity, current ratio
 *   • 52-week high/low with % from each
 *
 * For crypto — CoinGecko:
 *   • Market cap rank, 7d/30d/1y price change
 *   • ATH and % below ATH
 *   • Community sentiment votes, Twitter followers, Reddit subscribers
 *
 * Plus: Alternative.me Fear & Greed Index (last 7 days)
 *
 * Response shape:
 *   {
 *     stocks: StockIntelligence[],
 *     crypto: CryptoIntelligence[],
 *     fearGreed: FearGreedIndex | null,
 *     summary: { bullish, neutral, bearish, avgUpside },
 *     metadata: { symbolCount, fetchedAt, dataQuality }
 *   }
 */

import { NextResponse } from 'next/server'
import type {
  StockIntelligence,
  CryptoIntelligence,
  FearGreedIndex,
} from '@/lib/investment-intelligence'

interface ForecastsSummary {
  totalSymbols: number
  stockSymbols: number
  cryptoSymbols: number
  bullish: number
  neutral: number
  bearish: number
  /** Average upside % across all stocks with analyst targets */
  avgUpsidePct: number | null
  /** Number of stocks with an upside ≥ 10% */
  highConvictionBuys: number
}

interface ForecastsResponse {
  stocks: StockIntelligence[]
  crypto: CryptoIntelligence[]
  fearGreed: FearGreedIndex | null
  summary: ForecastsSummary
  metadata: {
    symbolCount: number
    fetchedAt: string
    dataQuality: { full: number; partial: number; price_only: number }
    errors: string[]
  }
}

function buildSummary(
  stocks: StockIntelligence[],
  crypto: CryptoIntelligence[]
): ForecastsSummary {
  const bullishKeys = new Set(['strongBuy', 'buy'])
  const bearishKeys = new Set(['underperform', 'sell'])

  let bullish = 0
  let neutral = 0
  let bearish = 0
  const upsides: number[] = []

  for (const s of stocks) {
    if (bullishKeys.has(s.recommendationKey)) bullish++
    else if (bearishKeys.has(s.recommendationKey)) bearish++
    else neutral++
    if (s.upsideMean !== null) upsides.push(s.upsideMean)
  }

  // Treat crypto with positive 30d momentum as bullish
  for (const c of crypto) {
    if (c.priceChange30d !== null && c.priceChange30d > 5) bullish++
    else if (c.priceChange30d !== null && c.priceChange30d < -5) bearish++
    else neutral++
  }

  const avgUpsidePct =
    upsides.length > 0
      ? Math.round((upsides.reduce((a, b) => a + b, 0) / upsides.length) * 100) / 100
      : null

  const highConvictionBuys = upsides.filter((u) => u >= 10).length

  return {
    totalSymbols: stocks.length + crypto.length,
    stockSymbols: stocks.length,
    cryptoSymbols: crypto.length,
    bullish,
    neutral,
    bearish,
    avgUpsidePct,
    highConvictionBuys,
  }
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { fetchPortfolioIntelligence } = await import('@/lib/investment-intelligence')

    // Gather all unique symbols from active holdings
    const holdings = await prisma.holding.findMany({
      where: {
        assetClass: { in: ['STOCK', 'ETF', 'CRYPTO', 'BOND'] },
        account: { isActive: true },
      },
      select: { symbol: true, assetClass: true, currency: true },
      distinct: ['symbol'],
    })

    if (holdings.length === 0) {
      return NextResponse.json({
        stocks: [],
        crypto: [],
        fearGreed: null,
        summary: {
          totalSymbols: 0,
          stockSymbols: 0,
          cryptoSymbols: 0,
          bullish: 0,
          neutral: 0,
          bearish: 0,
          avgUpsidePct: null,
          highConvictionBuys: 0,
        },
        metadata: {
          symbolCount: 0,
          fetchedAt: new Date().toISOString(),
          dataQuality: { full: 0, partial: 0, price_only: 0 },
          errors: [],
        },
      } as ForecastsResponse)
    }

    const allSymbols = holdings.map((h) => h.symbol)
    const intelligence = await fetchPortfolioIntelligence(allSymbols)

    // Convert to arrays, sorted by upside (stocks) or market cap rank (crypto)
    const stocks = Object.values(intelligence.stocks).sort((a, b) => {
      if (a.upsideMean === null && b.upsideMean === null) return a.symbol.localeCompare(b.symbol)
      if (a.upsideMean === null) return 1
      if (b.upsideMean === null) return -1
      return b.upsideMean - a.upsideMean
    })

    const crypto = Object.values(intelligence.crypto).sort((a, b) => {
      if (a.marketCapRank === null && b.marketCapRank === null) return 0
      if (a.marketCapRank === null) return 1
      if (b.marketCapRank === null) return -1
      return a.marketCapRank - b.marketCapRank
    })

    // Count data quality
    const dataQuality = stocks.reduce(
      (acc, s) => {
        acc[s.dataQuality]++
        return acc
      },
      { full: 0, partial: 0, price_only: 0 } as Record<string, number>
    )

    return NextResponse.json({
      stocks,
      crypto,
      fearGreed: intelligence.fearGreed,
      summary: buildSummary(stocks, crypto),
      metadata: {
        symbolCount: stocks.length + crypto.length,
        fetchedAt: intelligence.fetchedAt,
        dataQuality,
        errors: intelligence.errors,
      },
    } as ForecastsResponse)
  } catch (error) {
    console.error('[GET /api/forecasts]', error)
    return NextResponse.json({
      stocks: [],
      crypto: [],
      fearGreed: null,
      summary: {
        totalSymbols: 0,
        stockSymbols: 0,
        cryptoSymbols: 0,
        bullish: 0,
        neutral: 0,
        bearish: 0,
        avgUpsidePct: null,
        highConvictionBuys: 0,
      },
      metadata: {
        symbolCount: 0,
        fetchedAt: new Date().toISOString(),
        dataQuality: { full: 0, partial: 0, price_only: 0 },
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      },
    } as ForecastsResponse)
  }
}
