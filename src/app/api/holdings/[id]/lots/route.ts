/**
 * Purchase Lot API — Crypto Cost-Basis Micro-Ledger
 *
 * GET    /api/holdings/[id]/lots          — list all lots for a holding
 * POST   /api/holdings/[id]/lots          — add a lot, recalculate avgCostBasis
 * DELETE /api/holdings/[id]/lots?lotId=X  — remove a lot, recalculate avgCostBasis
 *
 * After every write the parent Holding's avgCostBasis is updated to the
 * weighted-average cost across all remaining lots:
 *   avgCostBasis = totalFiatPaid / totalQuantity  (USD per unit)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Shared avgCostBasis recalculation ─────────────────────────────────────────

async function recalcAvgCost(holdingId: string) {
  const { prisma } = await import('@/lib/prisma')
  const lots = await prisma.purchaseLot.findMany({ where: { holdingId } })

  if (lots.length === 0) {
    await prisma.holding.update({
      where: { id: holdingId },
      data: { avgCostBasis: null },
    })
    return null
  }

  const totalQty  = lots.reduce((s, l) => s + l.quantity, 0)
  const totalCost = lots.reduce((s, l) => s + l.fiatCostUsd, 0)
  const avg = totalQty > 0 ? totalCost / totalQty : null

  await prisma.holding.update({
    where: { id: holdingId },
    data: { avgCostBasis: avg },
  })
  return avg
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const lots = await prisma.purchaseLot.findMany({
      where: { holdingId: params.id },
      orderBy: { date: 'asc' },
    })
    return NextResponse.json(
      lots.map((l) => ({ ...l, date: l.date.toISOString(), createdAt: l.createdAt.toISOString() }))
    )
  } catch (error) {
    console.error('[GET /api/holdings/[id]/lots]', error)
    return NextResponse.json({ error: 'Failed to fetch purchase lots' }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { date: string; quantity: number; fiatCostUsd: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { date, quantity, fiatCostUsd } = body

  if (!date || !quantity || !fiatCostUsd) {
    return NextResponse.json(
      { error: 'date, quantity, and fiatCostUsd are required' },
      { status: 400 }
    )
  }
  if (quantity <= 0 || fiatCostUsd <= 0) {
    return NextResponse.json(
      { error: 'quantity and fiatCostUsd must be positive numbers' },
      { status: 400 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    // Confirm the holding exists
    const holding = await prisma.holding.findUnique({
      where: { id: params.id },
      select: { id: true, accountId: true },
    })
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }

    const lot = await prisma.purchaseLot.create({
      data: {
        holdingId: params.id,
        date: new Date(date),
        quantity,
        fiatCostUsd,
      },
    })

    const newAvg = await recalcAvgCost(params.id)

    return NextResponse.json(
      {
        lot: { ...lot, date: lot.date.toISOString(), createdAt: lot.createdAt.toISOString() },
        avgCostBasis: newAvg,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[POST /api/holdings/[id]/lots]', error)
    return NextResponse.json({ error: 'Failed to add purchase lot' }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const lotId = new URL(request.url).searchParams.get('lotId')
  if (!lotId) {
    return NextResponse.json({ error: 'lotId query param is required' }, { status: 400 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    const lot = await prisma.purchaseLot.findUnique({ where: { id: lotId } })
    if (!lot || lot.holdingId !== params.id) {
      return NextResponse.json({ error: 'Purchase lot not found' }, { status: 404 })
    }

    await prisma.purchaseLot.delete({ where: { id: lotId } })
    const newAvg = await recalcAvgCost(params.id)

    return NextResponse.json({ success: true, avgCostBasis: newAvg })
  } catch (error) {
    console.error('[DELETE /api/holdings/[id]/lots]', error)
    return NextResponse.json({ error: 'Failed to delete purchase lot' }, { status: 500 })
  }
}
