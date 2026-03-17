/**
 * /api/accounts/[id]/btc-holding
 *
 * GET  – Returns the current BTC holding for this account:
 *         quantity, avgCostBasis, live market price, calculated value.
 *         Price is always fetched from market data (never editable by user).
 *
 * PUT  – Updates quantity and optional avgCostBasis.
 *         Recalculates currentValue = quantity × currentPrice in DB.
 *         Only allowed in manual mode (no watch-only address configured).
 *         In watch-only mode, quantity comes from the chain — reject the write.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { fetchCryptoPrice, MOCK_PRICES } from '@/lib/market-data'

export interface BTCHoldingData {
  holdingId: string | null
  quantity: number
  avgCostBasis: number | null
  currentPrice: number
  currentValue: number
  dailyChangePercent: number
  priceSource: string
  isWatchOnly: boolean
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Fetch live price (falls back to mock automatically inside fetchCryptoPrice)
  const priceData = await fetchCryptoPrice('BTC')

  try {
    const { prisma } = await import('@/lib/prisma')

    const [account, holding] = await Promise.all([
      prisma.account.findUnique({ where: { id: params.id }, select: { metadata: true } }),
      prisma.holding.findFirst({
        where: { accountId: params.id, symbol: 'BTC' },
        select: { id: true, quantity: true, avgCostBasis: true, currentPrice: true, currentValue: true, dailyChangePercent: true },
      }),
    ])

    const meta = (account?.metadata ?? {}) as Record<string, unknown>
    const isWatchOnly = !!(meta.btcAddress || process.env.BTC_ADDRESS)

    if (!holding) {
      // No holding row yet — return zeros so the UI can create one via PUT
      return NextResponse.json({
        holdingId: null,
        quantity: 0,
        avgCostBasis: null,
        currentPrice: priceData.price,
        currentValue: 0,
        dailyChangePercent: priceData.changePercent24h,
        priceSource: priceData.source,
        isWatchOnly,
      } satisfies BTCHoldingData)
    }

    return NextResponse.json({
      holdingId: holding.id,
      quantity: holding.quantity,
      avgCostBasis: holding.avgCostBasis,
      currentPrice: priceData.price,
      currentValue: holding.quantity * priceData.price,
      dailyChangePercent: priceData.changePercent24h,
      priceSource: priceData.source,
      isWatchOnly,
    } satisfies BTCHoldingData)
  } catch {
    // No DB — return mock holding with live price
    const mockHolding = { quantity: 0.85, avgCostBasis: 42000 }
    return NextResponse.json({
      holdingId: null,
      quantity: mockHolding.quantity,
      avgCostBasis: mockHolding.avgCostBasis,
      currentPrice: priceData.price,
      currentValue: mockHolding.quantity * priceData.price,
      dailyChangePercent: priceData.changePercent24h,
      priceSource: priceData.source,
      isWatchOnly: !!process.env.BTC_ADDRESS,
    } satisfies BTCHoldingData)
  }
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { quantity, avgCostBasis } = body as { quantity?: unknown; avgCostBasis?: unknown }

  // Validate quantity
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty < 0) {
    return NextResponse.json(
      { error: 'quantity must be a non-negative number' },
      { status: 422 }
    )
  }

  // Validate optional avgCostBasis
  const costBasis = avgCostBasis !== undefined && avgCostBasis !== null && avgCostBasis !== ''
    ? Number(avgCostBasis)
    : null
  if (costBasis !== null && (!Number.isFinite(costBasis) || costBasis < 0)) {
    return NextResponse.json(
      { error: 'avgCostBasis must be a non-negative number' },
      { status: 422 }
    )
  }

  // Fetch live price so currentValue is always accurate
  const priceData = await fetchCryptoPrice('BTC')
  const currentValue = qty * priceData.price

  try {
    const { prisma } = await import('@/lib/prisma')

    // Guard: refuse edits if watch-only mode is active
    const account = await prisma.account.findUnique({
      where: { id: params.id },
      select: { metadata: true, type: true },
    })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    if (account.type !== 'CRYPTO') {
      return NextResponse.json({ error: 'Only CRYPTO accounts have BTC holdings' }, { status: 400 })
    }

    const meta = (account.metadata ?? {}) as Record<string, unknown>
    const isWatchOnly = !!(meta.btcAddress || process.env.BTC_ADDRESS)
    if (isWatchOnly) {
      return NextResponse.json(
        { error: 'Cannot manually edit quantity while watch-only mode is active. Remove the BTC address first.' },
        { status: 409 }
      )
    }

    // Upsert the BTC holding row
    const existingHolding = await prisma.holding.findFirst({
      where: { accountId: params.id, symbol: 'BTC' },
    })

    const holdingData = {
      quantity: qty,
      avgCostBasis: costBasis,
      currentPrice: priceData.price,
      currentValue,
      dailyChangePercent: priceData.changePercent24h,
      updatedAt: new Date(),
    }

    const holding = existingHolding
      ? await prisma.holding.update({ where: { id: existingHolding.id }, data: holdingData })
      : await prisma.holding.create({
          data: {
            accountId: params.id,
            symbol: 'BTC',
            name: 'Bitcoin',
            assetClass: 'CRYPTO',
            currency: 'USD',
            ...holdingData,
          },
        })

    // Keep account balance in sync
    await prisma.account.update({
      where: { id: params.id },
      data: { balance: currentValue, lastSyncedAt: new Date() },
    })

    return NextResponse.json({
      holdingId: holding.id,
      quantity: holding.quantity,
      avgCostBasis: holding.avgCostBasis,
      currentPrice: priceData.price,
      currentValue,
      dailyChangePercent: priceData.changePercent24h,
      priceSource: priceData.source,
      isWatchOnly: false,
    } satisfies BTCHoldingData)
  } catch (error) {
    // If DB is not connected, still return the calculated preview
    if ((error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED' ||
        String(error).includes('connect')) {
      return NextResponse.json(
        { error: 'Database not connected. Connect PostgreSQL to persist holdings.' },
        { status: 503 }
      )
    }
    console.error('[btc-holding] PUT:', error)
    return NextResponse.json({ error: 'Failed to update BTC holding' }, { status: 500 })
  }
}
