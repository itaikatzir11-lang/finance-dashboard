/**
 * GET    /api/snapshots — historical net worth snapshots for the portfolio chart
 * POST   /api/snapshots — create a new snapshot from current account balances
 * DELETE /api/snapshots — delete all snapshots (or before a given date)
 *
 * GET:    returns records ordered by createdAt asc. Returns [] when DB unavailable.
 * POST:   sums holdings value (falls back to account.balance) with live ILS→USD rate.
 * DELETE: ?before=ISO-date deletes snapshots before that date; omit to delete all.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIlsToUsd } from '@/lib/fx-rate'

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(_request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const ILS_USD = await getIlsToUsd()

    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: { holdings: { select: { currentValue: true, currency: true, assetClass: true } } },
    })

    // cash = bank balance + brokerage CASH holdings
    // capitalMarket = brokerage invested holdings (stocks, ETFs, bonds, etc.)
    const breakdown = { cash: 0, crypto: 0, capitalMarket: 0, pension: 0 }

    for (const account of accounts) {
      if (account.type === 'BANK') {
        breakdown.cash += account.currency === 'ILS'
          ? account.balance * ILS_USD
          : account.balance
      } else if (account.type === 'CRYPTO') {
        const holdingsValue = account.holdings.reduce((sum, h) => {
          return sum + (h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue)
        }, 0)
        breakdown.crypto += holdingsValue > 0
          ? holdingsValue
          : (account.currency === 'ILS' ? account.balance * ILS_USD : account.balance)
      } else if (account.type === 'BROKERAGE') {
        for (const h of account.holdings) {
          const usdValue = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
          if (h.assetClass === 'CASH') {
            breakdown.cash += usdValue
          } else {
            breakdown.capitalMarket += usdValue
          }
        }
        if (account.holdings.length === 0) {
          breakdown.cash += account.currency === 'ILS'
            ? account.balance * ILS_USD
            : account.balance
        }
      } else if (account.type === 'PENSION') {
        const holdingsValue = account.holdings.reduce((sum, h) => {
          return sum + (h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue)
        }, 0)
        breakdown.pension += holdingsValue > 0
          ? holdingsValue
          : (account.currency === 'ILS' ? account.balance * ILS_USD : account.balance)
      }
    }

    const totalValue = breakdown.cash + breakdown.crypto + breakdown.capitalMarket + breakdown.pension

    const snapshot = await prisma.netWorthSnapshot.create({
      data: { totalValue, breakdown },
    })

    return NextResponse.json({
      id: snapshot.id,
      totalValue: snapshot.totalValue,
      breakdown: snapshot.breakdown,
      createdAt: snapshot.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[/api/snapshots] POST:', error)
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 365

  try {
    const { prisma } = await import('@/lib/prisma')

    const snapshots = await prisma.netWorthSnapshot.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, totalValue: true, breakdown: true, createdAt: true },
    })

    return NextResponse.json(snapshots)
  } catch {
    // DB not available — return empty, not fake data
    return NextResponse.json([])
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

// Minimum age of snapshots that may be deleted (90 days)
const MIN_RETENTION_DAYS = 90

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const before = searchParams.get('before')

    // `before` is required — refuse open-ended "delete all" calls
    if (!before) {
      return NextResponse.json(
        { error: 'Missing required query parameter: before (ISO date string)' },
        { status: 400 }
      )
    }

    const beforeDate = new Date(before)
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use an ISO date string, e.g. 2024-01-01' },
        { status: 400 }
      )
    }

    // Enforce 90-day retention window — cannot delete recent snapshots
    const retentionCutoff = new Date()
    retentionCutoff.setDate(retentionCutoff.getDate() - MIN_RETENTION_DAYS)

    if (beforeDate > retentionCutoff) {
      return NextResponse.json(
        {
          error: `Cannot delete snapshots newer than ${MIN_RETENTION_DAYS} days. ` +
                 `The earliest deletable date is ${retentionCutoff.toISOString().slice(0, 10)}.`,
        },
        { status: 422 }
      )
    }

    const { prisma } = await import('@/lib/prisma')
    const { count } = await prisma.netWorthSnapshot.deleteMany({
      where: { createdAt: { lt: beforeDate } },
    })

    return NextResponse.json({ success: true, deleted: count })
  } catch (error) {
    console.error('[/api/snapshots] DELETE:', error)
    return NextResponse.json({ error: 'Failed to delete snapshots' }, { status: 500 })
  }
}
