/**
 * GET /api/dividends
 *
 * Returns aggregated dividend income from transactions.
 * Groups by symbol and by month for charting.
 *
 * Falls back to mock data if DB is unavailable.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MOCK_TRANSACTIONS } from '@/lib/mock-data'

function buildSummary(transactions: Array<{ type: string; amount: number; symbol: string | null; date: string; currency: string }>, year?: number) {
  const dividendTxs = transactions.filter((t) => {
    if (t.type !== 'DIVIDEND') return false
    if (year != null) return new Date(t.date).getFullYear() === year
    return true
  })

  const totalIncome = dividendTxs.reduce((sum, t) => sum + t.amount, 0)

  // Per symbol breakdown
  const bySymbol: Record<string, number> = {}
  for (const t of dividendTxs) {
    const sym = t.symbol ?? 'Unknown'
    bySymbol[sym] = (bySymbol[sym] ?? 0) + t.amount
  }

  // Monthly totals (last 12 months)
  const byMonth: Record<string, number> = {}
  for (const t of dividendTxs) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth[key] = (byMonth[key] ?? 0) + t.amount
  }

  const monthlyChart = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, total]) => {
      const [year, month] = key.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        month: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        total: Math.round(total * 100) / 100,
      }
    })

  const symbolBreakdown = Object.entries(bySymbol)
    .sort(([, a], [, b]) => b - a)
    .map(([symbol, total]) => ({ symbol, total: Math.round(total * 100) / 100 }))

  // Available years derived from all dividend transactions (for the year picker)
  const allYears = [...new Set(dividendTxs.map((t) => new Date(t.date).getFullYear()))].sort((a, b) => b - a)

  return { totalIncome, symbolBreakdown, monthlyChart, count: dividendTxs.length, availableYears: allYears }
}

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get('year')
  const year = yearParam ? parseInt(yearParam, 10) : undefined
  const validYear = year != null && Number.isFinite(year) ? year : undefined

  try {
    const { prisma } = await import('@/lib/prisma')

    const transactions = await prisma.transaction.findMany({
      where: { type: 'DIVIDEND' },
      select: { type: true, amount: true, symbol: true, date: true, currency: true },
      orderBy: { date: 'asc' },
    })

    const formatted = transactions.map((t) => ({
      ...t,
      date: t.date.toISOString(),
    }))

    return NextResponse.json({ ...buildSummary(formatted, validYear), dataSource: 'db' })
  } catch {
    // DB unavailable — use mock
    const formatted = MOCK_TRANSACTIONS
      .filter((t) => t.type === 'DIVIDEND')
      .map((t) => ({ type: t.type, amount: t.amount, symbol: t.symbol, date: t.date, currency: t.currency }))

    return NextResponse.json({ ...buildSummary(formatted, validYear), dataSource: 'mock' })
  }
}
