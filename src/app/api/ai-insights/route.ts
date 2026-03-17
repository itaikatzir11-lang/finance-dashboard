/**
 * POST /api/ai-insights
 *
 * HTTP wrapper around /lib/ai-engine.ts.
 *
 * This route is responsible for:
 *   1. Fetching all live portfolio data from the DB
 *   2. Computing PortfolioMetrics (concentration, P&L, ILS exposure, etc.)
 *   3. Optionally enriching the prompt with analyst intelligence (stocks, crypto)
 *   4. Delegating to generatePortfolioInsights() for the Hebrew LLM call
 *   5. Returning structured HebrewInsights + PortfolioMetrics to the client
 *
 * If ANTHROPIC_API_KEY is missing → { available: false, message }
 * If DB is unavailable            → mock metrics + LLM fallback
 * If Claude call fails/times out  → buildFallback() in ai-engine.ts
 *
 * All monetary values are in USD unless explicitly noted.
 */

import { NextResponse } from 'next/server'
import type { StockIntelligence, CryptoIntelligence, FearGreedIndex } from '@/lib/investment-intelligence'
import type { EngineInput } from '@/lib/ai-engine'

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting — 60-second cooldown between AI calls
// Prevents accidental double-clicks or auto-refreshing tabs from running up
// Anthropic API costs. Stored in the DB so it survives serverless cold starts.
// ─────────────────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio metrics (computed locally, returned alongside AI insights)
// ─────────────────────────────────────────────────────────────────────────────

interface PortfolioMetrics {
  totalNetWorthUsd: number
  bankUsd: number
  cryptoUsd: number
  brokerageUsd: number
  pensionUsd: number
  bankPct: number
  cryptoPct: number
  brokeragePct: number
  pensionPct: number
  /** Herfindahl-Hirschman Index 0–10000. >2500 = highly concentrated. */
  concentrationHHI: number
  /** % of total in the single largest holding */
  top1Pct: number
  /** % of total in the top-3 holdings */
  top3Pct: number
  ilsExposureUsd: number
  ilsExposurePct: number
  unrealizedPnlUsd: number | null
  unrealizedPnlPct: number | null
  change30dUsd: number | null
  change30dPct: number | null
  holdingCount: number
  /** Cash held in BROKERAGE accounts (assetClass === CASH, e.g. יתרה כספית) */
  brokerageCashUsd: number
}

interface HoldingRow {
  symbol: string
  name: string
  assetClass: string
  quantity: number
  currentPrice: number
  currentValue: number
  valueUsd: number
  dailyChangePercent: number
  avgCostBasis: number | null
  currency: string
  accountType: string
}

function buildMetrics(holdings: HoldingRow[], totalUsd: number, ilsToUsd: number): PortfolioMetrics {
  const bank          = holdings.filter((h) => h.accountType === 'BANK').reduce((s, h) => s + h.valueUsd, 0)
  const crypto        = holdings.filter((h) => h.accountType === 'CRYPTO').reduce((s, h) => s + h.valueUsd, 0)
  const brokerage     = holdings.filter((h) => h.accountType === 'BROKERAGE').reduce((s, h) => s + h.valueUsd, 0)
  const pension       = holdings.filter((h) => h.accountType === 'PENSION').reduce((s, h) => s + h.valueUsd, 0)
  const brokerageCash = holdings.filter((h) => h.accountType === 'BROKERAGE' && h.assetClass === 'CASH').reduce((s, h) => s + h.valueUsd, 0)

  const sorted = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd)
  const top1Pct = totalUsd > 0 && sorted[0] ? (sorted[0].valueUsd / totalUsd) * 100 : 0
  const top3Pct = totalUsd > 0
    ? (sorted.slice(0, 3).reduce((s, h) => s + h.valueUsd, 0) / totalUsd) * 100 : 0

  const hhi = totalUsd > 0
    ? holdings.reduce((sum, h) => { const s = (h.valueUsd / totalUsd) * 100; return sum + s * s }, 0)
    : 0

  const ilsExposureUsd = holdings.filter((h) => h.currency === 'ILS').reduce((s, h) => s + h.valueUsd, 0)

  let pnlUsd: number | null = null
  let pnlCost = 0
  let hasCostBasis = false
  for (const h of holdings) {
    if (h.avgCostBasis !== null && h.avgCostBasis > 0) {
      hasCostBasis = true
      const costUsd = h.avgCostBasis * h.quantity * (h.currency === 'ILS' ? ilsToUsd : 1)
      pnlUsd = (pnlUsd ?? 0) + (h.valueUsd - costUsd)
      pnlCost += costUsd
    }
  }

  return {
    totalNetWorthUsd: totalUsd,
    bankUsd: bank,
    cryptoUsd: crypto,
    brokerageUsd: brokerage,
    pensionUsd: pension,
    bankPct: totalUsd > 0 ? (bank / totalUsd) * 100 : 0,
    cryptoPct: totalUsd > 0 ? (crypto / totalUsd) * 100 : 0,
    brokeragePct: totalUsd > 0 ? (brokerage / totalUsd) * 100 : 0,
    pensionPct: totalUsd > 0 ? (pension / totalUsd) * 100 : 0,
    concentrationHHI: Math.round(hhi),
    top1Pct: Math.round(top1Pct * 10) / 10,
    top3Pct: Math.round(top3Pct * 10) / 10,
    ilsExposureUsd: Math.round(ilsExposureUsd),
    ilsExposurePct: totalUsd > 0 ? Math.round((ilsExposureUsd / totalUsd) * 1000) / 10 : 0,
    unrealizedPnlUsd: pnlUsd !== null ? Math.round(pnlUsd) : null,
    unrealizedPnlPct: hasCostBasis && pnlCost > 0 && pnlUsd !== null
      ? Math.round((pnlUsd / pnlCost) * 1000) / 10 : null,
    change30dUsd: null,
    change30dPct: null,
    holdingCount: holdings.length,
    brokerageCashUsd: Math.round(brokerageCash),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings summary string for the AI prompt
// ─────────────────────────────────────────────────────────────────────────────

function fmtPct(n: number | null): string {
  if (n === null) return 'N/A'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function buildHoldingsSummary(
  holdings: HoldingRow[],
  totalUsd: number,
  stocks: Record<string, StockIntelligence>,
  cryptoMap: Record<string, CryptoIntelligence>,
  fearGreed: FearGreedIndex | null
): string {
  const lines: string[] = []

  // Top holdings
  holdings.slice(0, 15).forEach((h) => {
    const gain =
      h.avgCostBasis !== null && h.avgCostBasis > 0
        ? ` | P&L ${fmtPct(((h.currentPrice - h.avgCostBasis) / h.avgCostBasis) * 100)}`
        : ''
    lines.push(
      `  ${h.symbol} (${h.accountType}) — $${Math.round(h.valueUsd).toLocaleString()} ` +
      `(${((h.valueUsd / (totalUsd || 1)) * 100).toFixed(1)}%)` +
      ` | day ${fmtPct(h.dailyChangePercent)}${gain}`
    )
  })

  // Analyst intelligence
  const stockKeys = Object.keys(stocks)
  if (stockKeys.length > 0) {
    lines.push('\nAnalyst consensus (held stocks):')
    stockKeys.forEach((sym) => {
      const s = stocks[sym]
      const target = s.targetMean !== null
        ? ` | target $${s.targetMean.toFixed(0)} (${fmtPct(s.upsideMean)} upside)`
        : ''
      lines.push(`  ${sym}: ${s.recommendationLabel}${target} | ${s.analystCount} analysts`)
    })
  }

  // Crypto Fear & Greed
  if (fearGreed) {
    lines.push(
      `\nCrypto Fear & Greed: ${fearGreed.current.value}/100 — ${fearGreed.current.classification}`
    )
  }

  // Crypto momentum
  const cryptoKeys = Object.keys(cryptoMap)
  if (cryptoKeys.length > 0) {
    lines.push('Crypto momentum:')
    cryptoKeys.forEach((sym) => {
      const c = cryptoMap[sym]
      const momentum = [
        c.priceChange7d !== null ? `7d ${fmtPct(c.priceChange7d)}` : '',
        c.priceChange30d !== null ? `30d ${fmtPct(c.priceChange30d)}` : '',
      ].filter(Boolean).join(' / ')
      lines.push(`  ${sym}: ${momentum || 'N/A'}`)
    })
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST() {
  // ── Rate limit check ──────────────────────────────────────────────────────
  const { checkAndSetAiInsightRateLimit } = await import('@/lib/user-settings')
  const { allowed, retryAfter } = await checkAndSetAiInsightRateLimit(COOLDOWN_MS)
  if (!allowed) {
    return NextResponse.json(
      { available: false, message: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  // ── Step 1: Pull live portfolio data ──────────────────────────────────────
  let holdings: HoldingRow[] = []
  let totalUsd = 0
  let metrics: PortfolioMetrics | undefined
  let ILS_USD = 0.27

  try {
    const { prisma } = await import('@/lib/prisma')
    const { getIlsToUsd } = await import('@/lib/fx-rate')

    const [accounts, rate, snapshots] = await Promise.all([
      prisma.account.findMany({ where: { isActive: true }, include: { holdings: true } }),
      getIlsToUsd(),
      prisma.netWorthSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { totalValue: true, createdAt: true },
      }),
    ])

    ILS_USD = rate

    for (const acc of accounts) {
      if (acc.type === 'BANK') {
        // BANK accounts store their balance on account.balance, not in holdings.
        // Represent each bank account as a synthetic holding row so the AI
        // prompt sees the correct cash value instead of $0.
        const valueUsd = acc.currency === 'ILS' ? acc.balance * ILS_USD : acc.balance
        if (valueUsd > 0) {
          holdings.push({
            symbol: 'BANK_CASH',
            name: acc.name,
            assetClass: 'CASH',
            quantity: 1,
            currentPrice: valueUsd,
            currentValue: valueUsd,
            valueUsd,
            dailyChangePercent: 0,
            avgCostBasis: null,
            currency: 'USD',
            accountType: 'BANK',
          })
          totalUsd += valueUsd
        }
        continue
      }

      for (const h of acc.holdings) {
        const valueUsd = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
        holdings.push({
          symbol: h.symbol,
          name: h.name,
          assetClass: h.assetClass,
          quantity: h.quantity,
          currentPrice: h.currentPrice,
          currentValue: h.currentValue,
          valueUsd,
          dailyChangePercent: h.dailyChangePercent,
          avgCostBasis: h.avgCostBasis,
          currency: h.currency,
          accountType: acc.type,
        })
        totalUsd += valueUsd
      }
    }

    // Drop zero-quantity rows — closed positions should not affect metrics or AI prompt
    holdings = holdings.filter((h) => h.quantity > 0)
    holdings.sort((a, b) => b.valueUsd - a.valueUsd)
    metrics = buildMetrics(holdings, totalUsd, ILS_USD)

    // 30-day performance from snapshots
    if (metrics && snapshots.length >= 2) {
      const newest = snapshots[0].totalValue
      const oldest = snapshots[snapshots.length - 1].totalValue
      const change = newest - oldest
      metrics.change30dUsd = Math.round(change)
      metrics.change30dPct = oldest > 0 ? Math.round((change / oldest) * 1000) / 10 : null
    }
  } catch {
    // DB unavailable — proceed with empty holdings; engine will return fallback
  }

  // ── Step 2: Fetch market intelligence (best-effort) ──────────────────────
  const symbols = [...new Set(holdings.map((h) => h.symbol))]
  let stocks: Record<string, StockIntelligence> = {}
  let cryptoMap: Record<string, CryptoIntelligence> = {}
  let fearGreed: FearGreedIndex | null = null

  try {
    const { fetchPortfolioIntelligence } = await import('@/lib/investment-intelligence')
    const intel = await fetchPortfolioIntelligence(symbols)
    stocks = intel.stocks
    cryptoMap = intel.crypto
    fearGreed = intel.fearGreed
  } catch {
    // Intelligence unavailable — proceed without it; engine prompt still has bucket summary
  }

  // ── Step 3: Build EngineInput ─────────────────────────────────────────────
  // NetWorthBreakdown aggregated from account types
  const cashUsd    = holdings.filter((h) => h.accountType === 'BANK' || h.assetClass === 'CASH').reduce((s, h) => s + h.valueUsd, 0)
  const cryptoUsd  = holdings.filter((h) => h.accountType === 'CRYPTO').reduce((s, h) => s + h.valueUsd, 0)
  const capitalUsd = holdings.filter((h) => h.accountType === 'BROKERAGE' && h.assetClass !== 'CASH').reduce((s, h) => s + h.valueUsd, 0)
  const pensionUsd = holdings.filter((h) => h.accountType === 'PENSION').reduce((s, h) => s + h.valueUsd, 0)

  const holdingsSummary = buildHoldingsSummary(holdings, totalUsd, stocks, cryptoMap, fearGreed)

  const engineInput: EngineInput = {
    breakdown: {
      cash: cashUsd,
      crypto: cryptoUsd,
      capitalMarket: capitalUsd,
      pension: pensionUsd,
    },
    totalUsd,
    // ilsPerUsd = ILS received per 1 USD — e.g. 3.70
    // getIlsToUsd() returns ~0.27 (USD per ILS), so invert it
    ilsPerUsd: ILS_USD > 0 ? 1 / ILS_USD : 3.7,
    holdingsSummary: holdingsSummary || undefined,
  }

  // ── Step 4: Call the AI engine ────────────────────────────────────────────
  const { generatePortfolioInsights } = await import('@/lib/ai-engine')
  const { getInvestmentThesis } = await import('@/lib/user-settings')
  const userThesis = await getInvestmentThesis()
  if (userThesis) engineInput.userThesis = userThesis

  const insights = await generatePortfolioInsights(engineInput)

  return NextResponse.json({
    ...insights,
    portfolioMetrics: metrics ?? null,
  })
}
