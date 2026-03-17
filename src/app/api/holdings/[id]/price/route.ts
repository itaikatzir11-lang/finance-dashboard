/**
 * PUT /api/holdings/[id]/price
 * Manually override the current price of a holding.
 * Body: { price: number }
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 422 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    const existing = await prisma.holding.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })

    const updated = await prisma.holding.update({
      where: { id: params.id },
      data: {
        currentPrice: price,
        currentValue: price * existing.quantity,
        updatedAt: new Date(),
      },
      include: { account: true },
    })

    // Keep account balance in sync for non-BANK accounts
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
    console.error('[holdings/[id]/price] PUT:', error)
    return NextResponse.json({ error: 'Failed to update price' }, { status: 500 })
  }
}
