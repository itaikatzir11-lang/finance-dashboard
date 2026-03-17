/**
 * GET /api/accounts/[id]/balance-history
 *
 * Returns the last 30 net worth snapshots showing this account type's contribution.
 * Used to power a mini balance trend chart for BANK accounts.
 *
 * For BANK accounts: extracts breakdown.cash from NetWorthSnapshot.
 * For CRYPTO accounts: extracts breakdown.crypto.
 * For BROKERAGE accounts: extracts breakdown.capitalMarket.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

interface SnapshotBreakdown {
  cash?: number
  crypto?: number
  capitalMarket?: number
  pension?: number
  // legacy keys from old snapshots
  bank?: number
  brokerage?: number
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')

    const account = await prisma.account.findUnique({
      where: { id: params.id },
      select: { type: true, currency: true },
    })

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const snapshots = await prisma.netWorthSnapshot.findMany({
      orderBy: { createdAt: 'asc' },
      take: 30,
      select: { createdAt: true, breakdown: true },
    })

    // BANK and brokerage CASH both map to 'cash'; BROKERAGE invested maps to 'capitalMarket'
    // Fall back to legacy keys for old snapshots stored before the rename.
    const key: keyof SnapshotBreakdown =
      account.type === 'BANK' ? 'cash'
      : account.type === 'CRYPTO' ? 'crypto'
      : account.type === 'PENSION' ? 'pension'
      : 'capitalMarket'

    const history = snapshots.map((snap) => {
      const breakdown = snap.breakdown as SnapshotBreakdown
      return {
        date: snap.createdAt.toISOString(),
        value: breakdown[key] ?? 0,
      }
    })

    return NextResponse.json({
      accountId: params.id,
      accountType: account.type,
      currency: account.currency,
      history,
    })
  } catch (error) {
    console.error('[GET /api/accounts/[id]/balance-history]', error)
    return NextResponse.json({ accountId: params.id, history: [] })
  }
}
