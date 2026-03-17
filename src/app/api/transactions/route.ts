import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import type { TransactionWithRelations, PaginatedResponse } from '@/types'
import { MOCK_TRANSACTIONS } from '@/lib/mock-data'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const symbol = searchParams.get('symbol')
  const search = searchParams.get('search')?.trim() || null
  const type = searchParams.get('type') || null
  const dateFrom = searchParams.get('dateFrom') || null
  const dateTo = searchParams.get('dateTo') || null
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1)
  const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') ?? '25', 10), 1), 1000)

  try {
    const { prisma } = await import('@/lib/prisma')

    const where: Prisma.TransactionWhereInput = {}
    if (accountId) where.accountId = accountId
    if (symbol) where.symbol = symbol
    if (type) where.type = type as Prisma.EnumTransactionTypeFilter['equals']
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(`${dateTo}T23:59:59.999Z`)
    }
    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { account: true, holding: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ])

    const formatted = transactions.map((t) => ({
      ...t,
      date: t.date.toISOString(),
      importedAt: t.importedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      metadata: t.metadata as Record<string, unknown>,
      account: {
        ...t.account,
        lastSyncedAt: t.account.lastSyncedAt?.toISOString() ?? null,
        createdAt: t.account.createdAt.toISOString(),
        updatedAt: t.account.updatedAt.toISOString(),
        metadata: t.account.metadata as Record<string, unknown>,
      },
    }))

    const response: PaginatedResponse<TransactionWithRelations> = {
      data: formatted as TransactionWithRelations[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/transactions] GET', error)

    let filtered = [...MOCK_TRANSACTIONS]
    if (accountId) filtered = filtered.filter((t) => t.accountId === accountId)
    if (symbol) filtered = filtered.filter((t) => t.symbol === symbol)
    if (type) filtered = filtered.filter((t) => t.type === type)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((t) =>
        (t.symbol ?? '').toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      )
    }
    if (dateFrom) filtered = filtered.filter((t) => new Date(t.date) >= new Date(dateFrom))
    if (dateTo)   filtered = filtered.filter((t) => new Date(t.date) <= new Date(`${dateTo}T23:59:59.999Z`))

    const sorted = filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)

    const response: PaginatedResponse<TransactionWithRelations> = {
      data: paginated,
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize),
    }

    return NextResponse.json(response)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, type, symbol, quantity, price, amount, currency, description, date } = body

    if (!accountId || !type || amount === undefined) {
      return NextResponse.json(
        { error: 'accountId, type, and amount are required' },
        { status: 400 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    const transaction = await prisma.transaction.create({
      data: {
        accountId,
        type,
        symbol: symbol ?? null,
        quantity: quantity ?? null,
        price: price ?? null,
        amount,
        currency: currency ?? 'USD',
        description: description ?? null,
        date: date ? new Date(date) : new Date(),
        source: 'MANUAL',
      },
      include: { account: true },
    })

    return NextResponse.json({
      ...transaction,
      date: transaction.date.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      importedAt: null,
      metadata: {},
    }, { status: 201 })
  } catch (error) {
    console.error('[/api/transactions] POST', error)
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    )
  }
}
