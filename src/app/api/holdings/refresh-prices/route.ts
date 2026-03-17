/**
 * POST /api/holdings/refresh-prices
 *
 * Fetches live prices for all holdings in a given account and updates
 * currentPrice, currentValue, and dailyChangePercent in the DB.
 * Also creates a net worth snapshot after updating.
 *
 * Body: { accountId: string }
 * Returns: { updated, skipped, total, symbols, message }
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function snapshotNetWorth() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { getIlsToUsd } = await import('@/lib/fx-rate')
    const ILS_USD = await getIlsToUsd()
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: { holdings: true },
    })

    let bankTotal = 0, cryptoTotal = 0, brokerageTotal = 0

    for (const acc of accounts) {
      const holdingsValue = acc.holdings.reduce((sum, h) => {
        return sum + (h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue)
      }, 0)
      const accValue = holdingsValue > 0
        ? holdingsValue
        : (acc.currency === 'ILS' ? acc.balance * ILS_USD : acc.balance)

      if (acc.type === 'BANK') bankTotal += accValue
      else if (acc.type === 'CRYPTO') cryptoTotal += accValue
      else if (acc.type === 'BROKERAGE') brokerageTotal += accValue
    }

    await prisma.netWorthSnapshot.create({
      data: {
        totalValue: bankTotal + cryptoTotal + brokerageTotal,
        breakdown: { bank: bankTotal, crypto: cryptoTotal, brokerage: brokerageTotal, cash: bankTotal },
      },
    })
  } catch {
    // DB not available — snapshot skipped
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.accountId !== 'string') {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    }

    const { accountId } = body as { accountId: string }
    const { prisma } = await import('@/lib/prisma')
    const { fetchPrice } = await import('@/lib/market-data')

    const holdings = await prisma.holding.findMany({
      where: { accountId },
    })

    if (holdings.length === 0) {
      return NextResponse.json({
        updated: 0,
        skipped: 0,
        total: 0,
        symbols: [],
        message: 'No holdings found for this account',
      })
    }

    const symbols = [...new Set(holdings.map((h) => h.symbol))]

    // Fetch prices with small concurrency (3 at a time) to avoid rate limiting
    const priceMap: Record<string, Awaited<ReturnType<typeof fetchPrice>>> = {}
    const batchSize = 3
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const results = await Promise.allSettled(batch.map((s) => fetchPrice(s)))
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          priceMap[batch[idx]] = r.value
        }
      })
      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    let updated = 0
    let skipped = 0

    for (const holding of holdings) {
      const priceData = priceMap[holding.symbol]
      if (!priceData || priceData.source === 'mock') {
        skipped++
        continue
      }

      const newValue = priceData.price * holding.quantity
      await prisma.holding.update({
        where: { id: holding.id },
        data: {
          currentPrice: priceData.price,
          currentValue: newValue,
          dailyChangePercent: priceData.changePercent24h,
          ...(priceData.name && holding.name === holding.symbol ? { name: priceData.name } : {}),
          updatedAt: new Date(),
        },
      })
      updated++
    }

    // Update account's lastSyncedAt
    await prisma.account.update({
      where: { id: accountId },
      data: { lastSyncedAt: new Date() },
    })

    await snapshotNetWorth()

    return NextResponse.json({
      updated,
      skipped,
      total: holdings.length,
      symbols,
      message: `Refreshed ${updated}/${holdings.length} holdings (${symbols.join(', ')})`,
    })
  } catch (error) {
    console.error('[POST /api/holdings/refresh-prices]', error)
    return NextResponse.json(
      { error: 'Failed to refresh prices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
