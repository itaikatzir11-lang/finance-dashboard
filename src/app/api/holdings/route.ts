/**
 * GET  /api/holdings          — list all holdings (with account info)
 * POST /api/holdings          — create a new holding
 *
 * Falls back to mock-data.ts when the database is not connected.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MOCK_HOLDINGS } from '@/lib/mock-data'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  try {
    const { prisma } = await import('@/lib/prisma')

    const holdings = await prisma.holding.findMany({
      where: accountId ? { accountId } : undefined,
      include: { account: true },
      orderBy: { currentValue: 'desc' },
    })

    return NextResponse.json({ data: holdings, dataSource: 'db' })
  } catch (error) {
    console.error('[/api/holdings]', error)

    const filtered = accountId
      ? MOCK_HOLDINGS.filter((h) => h.accountId === accountId)
      : MOCK_HOLDINGS

    return NextResponse.json({ data: filtered, dataSource: 'mock' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, symbol, name, assetClass, quantity, avgCostBasis, currentPrice, currency } = body

    if (!accountId || !symbol || !name || !assetClass || quantity == null || currentPrice == null) {
      return NextResponse.json(
        { error: 'accountId, symbol, name, assetClass, quantity, and currentPrice are required' },
        { status: 400 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    const holding = await prisma.holding.create({
      data: {
        accountId,
        symbol: symbol.toUpperCase(),
        name,
        assetClass,
        quantity,
        avgCostBasis: avgCostBasis ?? null,
        currentPrice,
        currentValue: quantity * currentPrice,
        dailyChangePercent: 0,
        currency: currency ?? 'USD',
      },
      include: { account: true },
    })

    // Mini-sync: immediately fetch live price so dailyChangePercent isn't stuck at 0.
    // Runs after the holding is persisted — a failure here is non-fatal.
    try {
      const { fetchPrice } = await import('@/lib/market-data')
      const priceResult = await fetchPrice(symbol.toUpperCase())
      if (priceResult.price > 0) {
        const synced = await prisma.holding.update({
          where: { id: holding.id },
          data: {
            currentPrice: priceResult.price,
            currentValue: quantity * priceResult.price,
            dailyChangePercent: priceResult.changePercent24h,
            updatedAt: new Date(),
          },
          include: { account: true },
        })
        return NextResponse.json(synced, { status: 201 })
      }
    } catch {
      // Live price unavailable — return holding with the manually-entered price
    }

    return NextResponse.json(holding, { status: 201 })
  } catch (error) {
    console.error('[/api/holdings] POST', error)
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 })
  }
}
