/**
 * GET /api/benchmark?range=1Y
 *
 * Returns daily closing prices for SPY (S&P 500 ETF) from Yahoo Finance.
 * The values are normalized so the first point = 100, making it easy to
 * overlay on any portfolio regardless of absolute dollar value.
 *
 * Query params:
 *   range — one of: 1W, 1M, 3M, 6M, 1Y (default), ALL (→ 5y)
 *
 * Falls back to a deterministic flat line at 100 if the API is unavailable.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RANGE_MAP: Record<string, string> = {
  '1W':  '5d',
  '1M':  '1mo',
  '3M':  '3mo',
  '6M':  '6mo',
  '1Y':  '1y',
  'ALL': '5y',
}

export interface BenchmarkPoint {
  date: string   // ISO string
  value: number  // normalised (first point = 100)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const range = (searchParams.get('range') ?? '1Y').toUpperCase()
  const yahooRange = RANGE_MAP[range] ?? '1y'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=${yahooRange}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`)

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No result in Yahoo response')

    const timestamps: number[] = result.timestamp ?? []
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

    if (timestamps.length === 0) throw new Error('No price data')

    // Pair timestamps with closing prices, dropping nulls
    const pairs: { date: string; close: number }[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (close == null || !Number.isFinite(close)) continue
      pairs.push({
        date: new Date(timestamps[i] * 1000).toISOString(),
        close,
      })
    }

    if (pairs.length === 0) throw new Error('All prices null')

    const firstClose = pairs[0].close
    const points: BenchmarkPoint[] = pairs.map((p) => ({
      date: p.date,
      value: (p.close / firstClose) * 100,
    }))

    return NextResponse.json({ points, symbol: 'SPY', source: 'yahoo' })
  } catch (err) {
    console.warn('[/api/benchmark] Yahoo Finance unavailable:', err)

    // Fallback: flat line at 100 with slight upward drift (≈7% annualised)
    const days = range === '1W' ? 7 : range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : 365
    const points: BenchmarkPoint[] = Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.now() - (days - i) * 86400_000).toISOString()
      const annualRate = 0.07
      const value = 100 * Math.pow(1 + annualRate, i / 365)
      return { date, value: Math.round(value * 100) / 100 }
    })

    return NextResponse.json({ points, symbol: 'SPY', source: 'fallback' })
  }
}
