/**
 * /api/accounts/[id]/eth-holding
 *
 * GET  – Returns the current ETH holding for this account:
 *         quantity, avgCostBasis, live market price, calculated value.
 *         Price is always fetched from market data (never editable by user).
 *
 * PUT  – Updates quantity and optional avgCostBasis.
 *         Recalculates currentValue = quantity × currentPrice in DB.
 *         Only allowed in manual mode (no watch-only ETH address configured).
 *         In watch-only mode, quantity comes from the chain — reject the write.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { fetchCryptoPrice } from '@/lib/market-data'

export interface ETHHoldingData {
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
  const priceData = await fetchCryptoPrice('ETH')

  try {
    const { prisma } = await import('@/lib/prisma')

    const [account, holding] = await Promise.all([
      prisma.account.findUnique({ where: { id: params.id }, select: { metadata: true } }),
      prisma.holding.findFirst({
        where: { accountId: params.id, symbol: 'ETH' },
        select: { id: true, quantity: true, avgCostBasis: true, currentPrice: true, currentValue: true, dailyChangePercent: true },
      }),
    ])

    const meta = (account?.metadata ?? {}) as Record<string, unknown>
    const isWatchOnly = !!(meta.ethAddress || process.env.ETH_ADDRESS)

    if (!holding) {
      return NextResponse.json({
        holdingId: null,
        quantity: 0,
        avgCostBasis: null,
        currentPrice: priceData.price,
        currentValue: 0,
        dailyChangePercent: priceData.changePercent24h,
        priceSource: priceData.source,
        isWatchOnly,
      } satisfies ETHHoldingData)
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
    } satisfies ETHHoldingData)
  } catch {
    const mockHolding = { quantity: 2.5, avgCostBasis: 1800 }
    return NextResponse.json({
      holdingId: null,
      quantity: mockHolding.quantity,
      avgCostBasis: mockHolding.avgCostBasis,
      currentPrice: priceData.price,
      currentValue: mockHolding.quantity * priceData.price,
      dailyChangePercent: priceData.changePercent24h,
      priceSource: priceData.source,
      isWatchOnly: !!process.env.ETH_ADDRESS,
    } satisfies ETHHoldingData)
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

  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty < 0) {
    return NextResponse.json({ error: 'quantity must be a non-negative number' }, { status: 422 })
  }

  const costBasis = avgCostBasis !== undefined && avgCostBasis !== null && avgCostBasis !== ''
    ? Number(avgCostBasis)
    : null
  if (costBasis !== null && (!Number.isFinite(costBasis) || costBasis < 0)) {
    return NextResponse.json({ error: 'avgCostBasis must be a non-negative number' }, { status: 422 })
  }

  const priceData = await fetchCryptoPrice('ETH')
  const currentValue = qty * priceData.price

  try {
    const { prisma } = await import('@/lib/prisma')

    const account = await prisma.account.findUnique({
      where: { id: params.id },
      select: { metadata: true, type: true },
    })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    if (account.type !== 'CRYPTO') {
      return NextResponse.json({ error: 'Only CRYPTO accounts have ETH holdings' }, { status: 400 })
    }

    const meta = (account.metadata ?? {}) as Record<string, unknown>
    const isWatchOnly = !!(meta.ethAddress || process.env.ETH_ADDRESS)
    if (isWatchOnly) {
      return NextResponse.json(
        { error: 'Cannot manually edit quantity while watch-only mode is active.' },
        { status: 409 }
      )
    }

    const existingHolding = await prisma.holding.findFirst({
      where: { accountId: params.id, symbol: 'ETH' },
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
            symbol: 'ETH',
            name: 'Ethereum',
            assetClass: 'CRYPTO',
            currency: 'USD',
            ...holdingData,
          },
        })

    await prisma.account.update({
      where: { id: params.id },
      data: { lastSyncedAt: new Date() },
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
    } satisfies ETHHoldingData)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED' ||
        String(error).includes('connect')) {
      return NextResponse.json(
        { error: 'Database not connected. Connect PostgreSQL to persist holdings.' },
        { status: 503 }
      )
    }
    console.error('[eth-holding] PUT:', error)
    return NextResponse.json({ error: 'Failed to update ETH holding' }, { status: 500 })
  }
}
