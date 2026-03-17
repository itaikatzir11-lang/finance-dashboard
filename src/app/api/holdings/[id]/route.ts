/**
 * GET    /api/holdings/[id] – Fetch a single holding with its account.
 * PUT    /api/holdings/[id] – Update quantity, avgCostBasis, or name.
 * DELETE /api/holdings/[id] – Permanently delete a holding.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const holding = await prisma.holding.findUnique({
      where: { id: params.id },
      include: { account: true },
    })
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }
    return NextResponse.json(holding)
  } catch (error) {
    console.error('[holdings/[id]] GET:', error)
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 })
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

  const { quantity, avgCostBasis, name, assetClass } = body as {
    quantity?: unknown
    avgCostBasis?: unknown
    name?: unknown
    assetClass?: unknown
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }

  if (quantity !== undefined) {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ error: 'quantity must be a non-negative number' }, { status: 422 })
    }
    updateData.quantity = qty
  }

  if (avgCostBasis !== undefined) {
    if (avgCostBasis === null || avgCostBasis === '') {
      updateData.avgCostBasis = null
    } else {
      const cost = Number(avgCostBasis)
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: 'avgCostBasis must be a non-negative number' }, { status: 422 })
      }
      updateData.avgCostBasis = cost
    }
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 422 })
    }
    updateData.name = name.trim()
  }

  const VALID_ASSET_CLASSES = ['STOCK', 'ETF', 'CRYPTO', 'CASH', 'BOND', 'OTHER']
  if (assetClass !== undefined) {
    if (typeof assetClass !== 'string' || !VALID_ASSET_CLASSES.includes(assetClass)) {
      return NextResponse.json({ error: 'Invalid assetClass' }, { status: 422 })
    }
    updateData.assetClass = assetClass
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    const existing = await prisma.holding.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })

    // Recalculate currentValue whenever quantity changes
    if (updateData.quantity !== undefined) {
      updateData.currentValue = (updateData.quantity as number) * existing.currentPrice
    }

    const updated = await prisma.holding.update({
      where: { id: params.id },
      data: updateData,
      include: { account: true },
    })

    // Keep account.balance in sync by summing holdings — but only for BROKERAGE/CRYPTO.
    // BANK account balances are set directly from CSV imports ("יתרה" column) and must not
    // be overwritten here.
    if (updated.account.type !== 'BANK') {
      const accountHoldings = await prisma.holding.findMany({
        where: { accountId: existing.accountId },
        select: { currentValue: true },
      })
      const newBalance = accountHoldings.reduce((sum, h) => sum + h.currentValue, 0)
      await prisma.account.update({
        where: { id: existing.accountId },
        data: { balance: newBalance, updatedAt: new Date() },
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[holdings/[id]] PUT:', error)
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')

    const existing = await prisma.holding.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })

    const account = await prisma.account.findUnique({
      where: { id: existing.accountId },
      select: { type: true },
    })

    await prisma.holding.delete({ where: { id: params.id } })

    // Re-sum remaining holdings and update account balance — only for BROKERAGE/CRYPTO.
    // BANK account balances come from CSV imports and must not be overwritten here.
    if (account?.type !== 'BANK') {
      const remaining = await prisma.holding.findMany({
        where: { accountId: existing.accountId },
        select: { currentValue: true },
      })
      const newBalance = remaining.reduce((sum, h) => sum + h.currentValue, 0)
      await prisma.account.update({
        where: { id: existing.accountId },
        data: { balance: newBalance, updatedAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[holdings/[id]] DELETE:', error)
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 })
  }
}
