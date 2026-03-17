/**
 * GET /api/holdings/price?symbol=AAPL
 * Returns current price and 24h change for a given symbol.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 })
  }

  try {
    const { fetchPrice } = await import('@/lib/market-data')
    const result = await fetchPrice(symbol)
    return NextResponse.json({
      price: result.price,
      changePercent24h: result.changePercent24h,
      currency: result.currency,
      source: result.source,
      name: result.name,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 })
  }
}
