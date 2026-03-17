/**
 * GET /api/analytics
 *
 * Returns computed analytics from NetWorthSnapshot records.
 * If fewer than 2 snapshots exist → { hasData: false }.
 *
 * Breakdown keys: canonical { cash, crypto, capitalMarket, pension }
 * with legacy aliases { bank, brokerage } for old snapshots.
 */

import { NextResponse } from 'next/server'

// Canonical keys (written by sync/route.ts post-Fix 2) + legacy aliases
interface SnapshotBreakdown {
  cash?: number
  crypto?: number
  capitalMarket?: number
  pension?: number
  // Legacy — old snapshots written before the key rename
  bank?: number
  brokerage?: number
}

interface AnalyticsSnapshot {
  id: string
  totalValue: number
  breakdown: SnapshotBreakdown
  createdAt: Date
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function computeAnalytics(snapshots: AnalyticsSnapshot[]) {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const first = sorted[0]
  const last  = sorted[sorted.length - 1]

  // ── Portfolio history (one point per snapshot) ──────────────────────────
  const history = sorted.map((s) => ({
    date: new Date(s.createdAt).toISOString(),
    portfolio: s.totalValue,
  }))

  // ── Monthly P&L — last snapshot per month ────────────────────────────────
  const byMonth: Record<string, AnalyticsSnapshot> = {}
  for (const s of sorted) {
    byMonth[monthKey(new Date(s.createdAt))] = s
  }

  const monthKeys = Object.keys(byMonth).sort()
  const monthlyPnL: { month: string; pnl: number; isPositive: boolean }[] = []

  for (let i = 1; i < monthKeys.length; i++) {
    const prev = byMonth[monthKeys[i - 1]].totalValue
    const curr = byMonth[monthKeys[i]].totalValue
    const pnl  = curr - prev
    const [year, month] = monthKeys[i].split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    monthlyPnL.push({
      month: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      pnl: Math.round(pnl),
      isPositive: pnl >= 0,
    })
  }

  // ── Allocation history — one entry per month, canonical keys ─────────────
  const allocationHistory = monthKeys.map((key) => {
    const bd = (byMonth[key].breakdown ?? {}) as SnapshotBreakdown
    const [year, month] = key.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return {
      date: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      // Canonical key first, fall back to legacy key for old snapshots
      Cash:           bd.cash           ?? bd.bank      ?? 0,
      CapitalMarkets: bd.capitalMarket  ?? bd.brokerage ?? 0,
      Crypto:         bd.crypto         ?? 0,
      Pension:        bd.pension        ?? 0,
    }
  })

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const startVal     = first.totalValue
  const endVal       = last.totalValue
  const totalReturn  = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0

  const daysElapsed  =
    (new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) /
    (1000 * 60 * 60 * 24)
  const years = daysElapsed / 365
  // Need at least 30 days for CAGR to be meaningful — tiny years makes exponent explode
  const cagr  = years >= (30 / 365) && startVal > 0
    ? (Math.pow(endVal / startVal, 1 / years) - 1) * 100
    : totalReturn

  // Sharpe from monthly returns (risk-free ≈ 0)
  const monthlyReturns = monthlyPnL.map((m, i) => {
    const base = byMonth[monthKeys[i]]?.totalValue ?? 1
    return m.pnl / base
  })
  const avgMonthly = monthlyReturns.length
    ? monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length
    : 0
  const stdDev = monthlyReturns.length
    ? Math.sqrt(
        monthlyReturns.reduce((s, r) => s + Math.pow(r - avgMonthly, 2), 0) /
          monthlyReturns.length
      )
    : 0
  const sharpe = stdDev > 0 ? (avgMonthly * 12) / (stdDev * Math.sqrt(12)) : 0

  // Max drawdown
  let peak = sorted[0].totalValue
  let maxDrawdown = 0
  for (const s of sorted) {
    if (s.totalValue > peak) peak = s.totalValue
    const drawdown = peak > 0 ? ((s.totalValue - peak) / peak) * 100 : 0
    if (drawdown < maxDrawdown) maxDrawdown = drawdown
  }

  const bestMonth  = monthlyPnL.length ? monthlyPnL.reduce((b, m) => m.pnl > b.pnl ? m : b) : null
  const worstMonth = monthlyPnL.length ? monthlyPnL.reduce((w, m) => m.pnl < w.pnl ? m : w) : null
  const avgMonthlyPnL = monthlyPnL.length
    ? monthlyPnL.reduce((s, m) => s + m.pnl, 0) / monthlyPnL.length
    : 0

  return {
    hasData: true,
    snapshotCount: sorted.length,
    history,
    monthlyPnL,
    allocationHistory,
    kpis: {
      totalReturn, cagr, sharpe, maxDrawdown,
      bestMonth, worstMonth, avgMonthlyPnL,
      startVal, endVal, daysElapsed,
    },
  }
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')

    const snapshots = await prisma.netWorthSnapshot.findMany({
      orderBy: { createdAt: 'asc' },
      take: 365,
      select: { id: true, totalValue: true, breakdown: true, createdAt: true },
    })

    if (snapshots.length < 2) {
      return NextResponse.json({ hasData: false, snapshotCount: snapshots.length })
    }

    return NextResponse.json(
      computeAnalytics(
        snapshots.map((s) => ({
          ...s,
          breakdown: (s.breakdown ?? {}) as SnapshotBreakdown,
        }))
      )
    )
  } catch {
    return NextResponse.json({ hasData: false, snapshotCount: 0 })
  }
}
