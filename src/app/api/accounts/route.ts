import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { AccountWithStats } from '@/types'
import { MOCK_ACCOUNTS } from '@/lib/mock-data'
import { sanitizeAccountMetadata } from '@/lib/btc-address'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { getIlsToUsd } = await import('@/lib/fx-rate')

    const [accounts, ilsToUsd] = await Promise.all([
      prisma.account.findMany({
        where: { isActive: true },
        include: {
          holdings: {
            select: { id: true, currentValue: true, currency: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      getIlsToUsd(),
    ])

    // usdToIls: how many ILS you get for 1 USD (e.g. 3.70)
    const usdToIls = ilsToUsd > 0 ? 1 / ilsToUsd : 3.7

    const enriched: AccountWithStats[] = accounts.map((account) => {
      // Normalise every holding's currentValue into the account's own currency
      // before summing. BTC/ETH holdings are stored in USD; bank/pension/brokerage
      // holdings may be stored in ILS. Mixing them without conversion was the bug.
      const totalValue = account.holdings.reduce((sum, h) => {
        if (account.currency === 'ILS' && h.currency === 'USD') {
          return sum + h.currentValue * usdToIls
        }
        if (account.currency === 'USD' && h.currency === 'ILS') {
          return sum + h.currentValue * ilsToUsd
        }
        return sum + h.currentValue
      }, 0)
      // Destructure out `holdings` (partial select — not a full Holding[]) so it
      // doesn't conflict with AccountWithStats.holdings?: Holding[].
      const { holdings, ...rest } = account
      return {
        ...rest,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
        // Sanitize metadata: strip full btcAddress, expose only masked version + boolean flag
        metadata: sanitizeAccountMetadata(account.metadata as Record<string, unknown>),
        holdingCount: holdings.length,
        totalValue: totalValue > 0 ? totalValue : account.balance,
      }
    })

    return NextResponse.json({ data: enriched, dataSource: 'db' })
  } catch (error) {
    console.error('[/api/accounts] GET', error)
    return NextResponse.json({ data: MOCK_ACCOUNTS, dataSource: 'mock' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, currency, metadata } = body

    if (!name || !type) {
      return NextResponse.json(
        { error: 'name and type are required' },
        { status: 400 }
      )
    }

    if (!['BANK', 'CRYPTO', 'BROKERAGE', 'PENSION'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be BANK, CRYPTO, BROKERAGE, or PENSION' },
        { status: 400 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    let account
    if (type === 'PENSION') {
      // Pension accounts need a default SPY holding created atomically so the
      // sync and forecast engines have a baseline position to work with.
      account = await prisma.$transaction(async (tx) => {
        const created = await tx.account.create({
          data: {
            name,
            type,
            currency: currency ?? 'ILS',
            balance: 0,
            metadata: metadata ?? {},
          },
        })

        // Best-effort: fetch live SPY price for the placeholder holding.
        // If unavailable, the holding is created with zero values and will be
        // populated correctly on the first balance update or sync.
        let spyPrice = 0
        let spyChangePercent = 0
        try {
          const { fetchPrice } = await import('@/lib/market-data')
          const priceData = await fetchPrice('SPY')
          if (priceData.price > 0) {
            spyPrice = priceData.price
            spyChangePercent = priceData.changePercent24h
          }
        } catch { /* price fetch is best-effort */ }

        await tx.holding.create({
          data: {
            accountId: created.id,
            symbol: 'SPY',
            name: 'S&P 500 (SPY) — Pension',
            assetClass: 'ETF',
            quantity: 0,
            currentPrice: spyPrice,
            currentValue: 0,
            dailyChangePercent: spyChangePercent,
            currency: 'USD',
          },
        })

        return created
      })
    } else {
      account = await prisma.account.create({
        data: {
          name,
          type,
          currency: currency ?? 'USD',
          balance: 0,
          metadata: metadata ?? {},
        },
      })
    }

    return NextResponse.json({
      ...account,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      metadata: sanitizeAccountMetadata(account.metadata as Record<string, unknown>),
      holdingCount: type === 'PENSION' ? 1 : 0,
      totalValue: 0,
    }, { status: 201 })
  } catch (error) {
    console.error('[/api/accounts] POST', error)
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    )
  }
}
