import { NextResponse } from 'next/server'
import type { NetWorthSummary } from '@/types'
import { getIlsToUsd } from '@/lib/fx-rate'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')

    const [accounts, ILS_USD] = await Promise.all([
      prisma.account.findMany({
        where: { isActive: true },
        include: { holdings: true },
      }),
      getIlsToUsd(),
    ])

    // cash          = bank balance + brokerage CASH holdings (uninvested)
    // crypto        = all CRYPTO account value
    // capitalMarket = brokerage invested holdings (stocks, ETFs, bonds, etc.)
    // pension       = pension account value (tracks S&P 500 via SPY holding)
    let cashTotal = 0
    let brokerageCashTotal = 0
    let cryptoTotal = 0
    let capitalMarketTotal = 0
    let pensionTotal = 0

    for (const account of accounts) {
      if (account.type === 'BANK') {
        const usdBalance = account.currency === 'ILS'
          ? account.balance * ILS_USD
          : account.balance
        cashTotal += usdBalance
      } else if (account.type === 'CRYPTO') {
        const holdingsValue = account.holdings.reduce((sum, h) => {
          if (h.quantity <= 0) return sum
          const usdValue = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
          return sum + usdValue
        }, 0)
        const accountValue = holdingsValue > 0 ? holdingsValue : (
          account.currency === 'ILS' ? account.balance * ILS_USD : account.balance
        )
        cryptoTotal += accountValue
      } else if (account.type === 'BROKERAGE') {
        for (const h of account.holdings) {
          if (h.quantity <= 0) continue
          const usdValue = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
          if (h.assetClass === 'CASH') {
            cashTotal += usdValue
            brokerageCashTotal += usdValue
          } else {
            capitalMarketTotal += usdValue
          }
        }
        // If no holdings, count account balance as cash
        if (account.holdings.length === 0) {
          const usdBalance = account.currency === 'ILS'
            ? account.balance * ILS_USD
            : account.balance
          cashTotal += usdBalance
        }
      } else if (account.type === 'PENSION') {
        // Pension value: use SPY holding if synced, otherwise fall back to raw ILS balance
        const holdingsValue = account.holdings.reduce((sum, h) => {
          if (h.quantity <= 0) return sum
          const usdValue = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
          return sum + usdValue
        }, 0)
        pensionTotal += holdingsValue > 0
          ? holdingsValue
          : account.currency === 'ILS' ? account.balance * ILS_USD : account.balance
      }
    }

    const total = cashTotal + cryptoTotal + capitalMarketTotal + pensionTotal

    // Daily change: compare current total against the most recent snapshot
    // that is between 24h and 48h old. The 48h ceiling covers weekends and
    // days where no sync ran. If no snapshot falls in that window, we report
    // 0 rather than comparing against a potentially weeks-old baseline.
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    const yesterdaySnapshot = await prisma.netWorthSnapshot.findFirst({
      where: { createdAt: { gte: cutoff48h, lte: cutoff24h } },
      orderBy: { createdAt: 'desc' },
    })

    let dailyChange = 0
    let dailyChangePercent = 0

    if (yesterdaySnapshot) {
      dailyChange = total - yesterdaySnapshot.totalValue
      dailyChangePercent = yesterdaySnapshot.totalValue > 0
        ? (dailyChange / yesterdaySnapshot.totalValue) * 100
        : 0
    }

    const summary: NetWorthSummary = {
      total,
      breakdown: {
        cash: cashTotal,
        brokerageCash: brokerageCashTotal,
        crypto: cryptoTotal,
        capitalMarket: capitalMarketTotal,
        pension: pensionTotal,
      },
      dailyChange,
      dailyChangePercent,
    }

    return NextResponse.json({ ...summary, dataSource: 'db' })
  } catch (error) {
    console.error('[/api/net-worth]', error)
    // DB unavailable — return zeroed totals so no fake portfolio value is implied
    return NextResponse.json({
      total: 0,
      breakdown: { cash: 0, brokerageCash: 0, crypto: 0, capitalMarket: 0, pension: 0 },
      dailyChange: 0,
      dailyChangePercent: 0,
      dataSource: 'mock',
    })
  }
}
