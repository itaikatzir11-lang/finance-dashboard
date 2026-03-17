import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * PUT /api/transactions/[id]
 * Update editable fields on a transaction (type, symbol, quantity, price, amount, date, description).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = params
    const body = await request.json()

    const tx = await prisma.transaction.findUnique({ where: { id } })
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const VALID_TYPES = ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'TRANSFER']
    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 422 })
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        type:        body.type        ?? tx.type,
        symbol:      body.symbol      !== undefined ? body.symbol      : tx.symbol,
        quantity:    body.quantity    !== undefined ? body.quantity    : tx.quantity,
        price:       body.price       !== undefined ? body.price       : tx.price,
        amount:      body.amount      !== undefined ? body.amount      : tx.amount,
        currency:    body.currency    ?? tx.currency,
        description: body.description !== undefined ? body.description : tx.description,
        date:        body.date        ? new Date(body.date) : tx.date,
      },
      include: { account: true },
    })

    return NextResponse.json({
      ...updated,
      date:      updated.date.toISOString(),
      importedAt: updated.importedAt?.toISOString() ?? null,
      createdAt:  updated.createdAt.toISOString(),
      metadata:   {},
      account: {
        ...updated.account,
        lastSyncedAt: updated.account.lastSyncedAt?.toISOString() ?? null,
        createdAt:    updated.account.createdAt.toISOString(),
        updatedAt:    updated.account.updatedAt.toISOString(),
        metadata:     {},
      },
    })
  } catch (error) {
    console.error('[PUT /api/transactions/[id]]', error)
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

/**
 * DELETE /api/transactions/[id]
 * Permanently deletes a transaction record.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = params

    const tx = await prisma.transaction.findUnique({ where: { id } })
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    await prisma.transaction.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/transactions/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
