/**
 * GET /api/market-intelligence
 *
 * On-demand intelligence endpoint. Accepts either:
 *   ?symbols=AAPL,BTC,TEVA   — comma-separated list of symbols
 *   ?accountId=xxx           — fetches all symbols from that account's holdings
 *
 * Returns the raw PortfolioIntelligence object from the intelligence library,
 * useful for UI components that need data for a specific subset of holdings.
 *
 * Results are cached for 30 minutes in the intelligence library, so repeated
 * calls for the same symbols are cheap.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbolsParam = searchParams.get('symbols')
  const accountId = searchParams.get('accountId')

  let symbols: string[] = []

  if (symbolsParam) {
    symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0)
  } else if (accountId) {
    try {
      const { prisma } = await import('@/lib/prisma')
      const holdings = await prisma.holding.findMany({
        where: { accountId },
        select: { symbol: true },
        distinct: ['symbol'],
      })
      symbols = holdings.map((h) => h.symbol)
    } catch (error) {
      console.error('[GET /api/market-intelligence] DB error:', error)
      return NextResponse.json({ error: 'Failed to fetch holdings for account' }, { status: 500 })
    }
  }

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: 'Provide ?symbols=SYM1,SYM2 or ?accountId=xxx' },
      { status: 400 }
    )
  }

  // Cap at 20 symbols to prevent abuse
  if (symbols.length > 20) {
    return NextResponse.json(
      { error: 'Maximum 20 symbols per request' },
      { status: 400 }
    )
  }

  try {
    const { fetchPortfolioIntelligence } = await import('@/lib/investment-intelligence')
    const intelligence = await fetchPortfolioIntelligence(symbols)
    return NextResponse.json(intelligence)
  } catch (error) {
    console.error('[GET /api/market-intelligence]', error)
    return NextResponse.json(
      { error: 'Intelligence fetch failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
