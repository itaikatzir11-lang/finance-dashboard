/**
 * GET /api/export?type=holdings|transactions
 *
 * Returns a CSV file for download.
 * Falls back to mock data when DB is not available.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MOCK_HOLDINGS, MOCK_TRANSACTIONS } from '@/lib/mock-data'
import type { HoldingWithAccount, TransactionWithRelations } from '@/types'

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildHoldingsCsv(holdings: HoldingWithAccount[]): string {
  const headers = [
    'Symbol', 'Name', 'Asset Class', 'Account',
    'Quantity', 'Avg Cost', 'Current Price', 'Current Value',
    'Daily Change %', 'Gain/Loss $', 'Gain/Loss %',
  ]

  const rows = holdings.map((h) => {
    const gainLoss = h.avgCostBasis != null
      ? (h.currentPrice - h.avgCostBasis) * h.quantity
      : null
    const gainLossPct = h.avgCostBasis != null && h.avgCostBasis > 0
      ? ((h.currentPrice - h.avgCostBasis) / h.avgCostBasis) * 100
      : null

    return [
      escapeCsv(h.symbol),
      escapeCsv(h.name),
      escapeCsv(h.assetClass),
      escapeCsv(h.account.name),
      escapeCsv(h.quantity),
      escapeCsv(h.avgCostBasis),
      escapeCsv(h.currentPrice),
      escapeCsv(h.currentValue),
      escapeCsv(h.dailyChangePercent != null ? h.dailyChangePercent.toFixed(2) : null),
      escapeCsv(gainLoss != null ? gainLoss.toFixed(2) : null),
      escapeCsv(gainLossPct != null ? gainLossPct.toFixed(2) : null),
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

function buildTransactionsCsv(transactions: TransactionWithRelations[]): string {
  const headers = [
    'Date', 'Type', 'Symbol', 'Quantity', 'Price',
    'Amount', 'Currency', 'Description', 'Account', 'Source',
  ]

  const rows = transactions.map((tx) => {
    return [
      escapeCsv(tx.date ? tx.date.slice(0, 10) : null),
      escapeCsv(tx.type),
      escapeCsv(tx.symbol),
      escapeCsv(tx.quantity),
      escapeCsv(tx.price),
      escapeCsv(tx.amount),
      escapeCsv(tx.currency),
      escapeCsv(tx.description),
      escapeCsv(tx.account.name),
      escapeCsv(tx.source),
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type !== 'holdings' && type !== 'transactions') {
    return NextResponse.json(
      { error: 'type must be "holdings" or "transactions"' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString().slice(0, 10)

  if (type === 'holdings') {
    let holdings: HoldingWithAccount[] = []

    try {
      const { prisma } = await import('@/lib/prisma')
      holdings = await prisma.holding.findMany({
        include: { account: true },
        orderBy: { currentValue: 'desc' },
      }) as unknown as HoldingWithAccount[]
    } catch {
      holdings = MOCK_HOLDINGS
    }

    const csv = buildHoldingsCsv(holdings)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="holdings-${now}.csv"`,
      },
    })
  }

  // type === 'transactions'
  let transactions: TransactionWithRelations[] = []

  try {
    const { prisma } = await import('@/lib/prisma')
    transactions = await prisma.transaction.findMany({
      include: { account: true, holding: true },
      orderBy: { date: 'desc' },
    }) as unknown as TransactionWithRelations[]
  } catch {
    transactions = MOCK_TRANSACTIONS
  }

  const csv = buildTransactionsCsv(transactions)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${now}.csv"`,
    },
  })
}
