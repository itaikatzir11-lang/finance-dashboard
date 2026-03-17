'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import {
  Calendar,
  TrendingDown,
  TrendingUp,
  Building2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Users,
  Activity,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

// ── Mirrored types (backend-identical shape) ─────────────────────────────────

interface EarningsEstimate {
  period: string
  endDate: string
  growthEstimate: number | null
  epsEstimate: number | null
  epsActual: number | null
  numberOfAnalysts: number | null
}

interface InsiderTransaction {
  name: string
  relation: string
  transactionDescription: string
  startDate: string
  shares: number | null
  value: number | null
  ownership: number | null
}

interface InstitutionalHolder {
  organization: string
  pctHeld: number | null
  shares: number | null
  value: number | null
  dateReported: string | null
}

interface MajorHolders {
  insidersHeldPct: number | null
  institutionsHeldPct: number | null
  institutionsFloatHeldPct: number | null
  institutionsCount: number | null
}

interface StockIntelligence {
  symbol: string
  name: string
  currentPrice: number
  earningsEstimates: EarningsEstimate[]
  insiderTransactions: InsiderTransaction[]
  topInstitutionalHolders: InstitutionalHolder[]
  majorHolders: MajorHolders | null
  dataQuality: 'full' | 'partial' | 'price_only'
}

interface HoldingsResponse {
  data: { symbol: string; assetClass: string }[]
}

interface MarketIntelligenceResponse {
  stocks: Record<string, StockIntelligence>
  errors: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<string, string> = {
  '0q': 'Current Quarter',
  '+1q': 'Next Quarter',
  '0y': 'Current Year',
  '+1y': 'Next Year',
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function fmtShares(v: number | null): string {
  if (v === null) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

function pctColor(v: number | null): string {
  if (v === null) return 'text-slate-500'
  return v >= 0 ? 'text-emerald-400' : 'text-rose-400'
}

function transactionColor(desc: string): string {
  const lower = desc.toLowerCase()
  if (lower.includes('purchase') || lower.includes('buy')) return 'text-emerald-400'
  if (lower.includes('sale') || lower.includes('sell')) return 'text-rose-400'
  return 'text-slate-400'
}

function transactionIcon(desc: string) {
  const lower = desc.toLowerCase()
  if (lower.includes('purchase') || lower.includes('buy')) return <TrendingUp className="h-3 w-3" />
  if (lower.includes('sale') || lower.includes('sell')) return <TrendingDown className="h-3 w-3" />
  return <Minus className="h-3 w-3" />
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-indigo-400">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <div className="border-t border-slate-800">{children}</div>}
    </div>
  )
}

// ── Earnings Calendar ─────────────────────────────────────────────────────────

function EarningsCalendar({ stocks }: { stocks: StockIntelligence[] }) {
  // Collect all quarterly and annual estimates, annotate with symbol
  type EarningsRow = EarningsEstimate & { symbol: string; name: string }

  const rows: EarningsRow[] = stocks
    .flatMap((s) =>
      s.earningsEstimates.map((e) => ({ ...e, symbol: s.symbol, name: s.name }))
    )
    .filter((e) => e.period === '0q' || e.period === '+1q' || e.period === '0y' || e.period === '+1y')
    .filter((e) => e.endDate || e.epsEstimate !== null || e.growthEstimate !== null)
    .sort((a, b) => {
      // Sort by period order
      const order: Record<string, number> = { '0q': 0, '+1q': 1, '0y': 2, '+1y': 3 }
      return (order[a.period] ?? 99) - (order[b.period] ?? 99) || a.symbol.localeCompare(b.symbol)
    })

  if (rows.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-slate-500">
        No earnings estimate data available for held stocks.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Period</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Report Date</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">EPS Est.</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">EPS Prev Year</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Growth Est.</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell"># Analysts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((e, i) => (
            <tr key={i} className="hover:bg-slate-800/40 transition-colors">
              <td className="px-5 py-3">
                <div>
                  <span className="font-semibold text-slate-100">{e.symbol}</span>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[120px]">{e.name}</p>
                </div>
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs font-medium px-2 py-1 rounded-full border ${
                  e.period === '0q' || e.period === '0y'
                    ? 'text-indigo-300 bg-indigo-900/30 border-indigo-800/50'
                    : 'text-slate-400 bg-slate-800/50 border-slate-700/50'
                }`}>
                  {PERIOD_LABELS[e.period] ?? e.period}
                </span>
              </td>
              <td className="px-5 py-3 text-right text-slate-300 tabular-nums">
                {e.endDate
                  ? new Date(e.endDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </td>
              <td className="px-5 py-3 text-right font-mono text-slate-200">
                {e.epsEstimate !== null ? `$${e.epsEstimate.toFixed(2)}` : '—'}
              </td>
              <td className="px-5 py-3 text-right font-mono text-slate-400">
                {e.epsActual !== null ? `$${e.epsActual.toFixed(2)}` : '—'}
              </td>
              <td className={`px-5 py-3 text-right font-semibold tabular-nums ${pctColor(e.growthEstimate)}`}>
                {fmtPct(e.growthEstimate !== null ? e.growthEstimate * 100 : null)}
              </td>
              <td className="px-5 py-3 text-right text-slate-400 hidden lg:table-cell">
                {e.numberOfAnalysts !== null ? e.numberOfAnalysts : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Insider Trades ────────────────────────────────────────────────────────────

function InsiderTrades({ stocks }: { stocks: StockIntelligence[] }) {
  type InsiderRow = InsiderTransaction & { symbol: string }

  const rows: InsiderRow[] = stocks
    .flatMap((s) =>
      s.insiderTransactions.map((t) => ({ ...t, symbol: s.symbol }))
    )
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

  if (rows.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-slate-500">
        No insider transaction data available. This data typically applies to US-listed stocks only.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Insider</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Transaction</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Shares</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Owned After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((t, i) => (
            <tr key={i} className="hover:bg-slate-800/40 transition-colors">
              <td className="px-5 py-3 font-semibold text-slate-100">{t.symbol}</td>
              <td className="px-5 py-3">
                <div>
                  <span className="text-slate-200">{t.name}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{t.relation}</p>
                </div>
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 font-medium ${transactionColor(t.transactionDescription)}`}>
                  {transactionIcon(t.transactionDescription)}
                  {t.transactionDescription}
                </span>
              </td>
              <td className="px-5 py-3 text-right text-slate-400 tabular-nums">
                {new Date(t.startDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td className="px-5 py-3 text-right font-mono text-slate-300">
                {fmtShares(t.shares)}
              </td>
              <td className="px-5 py-3 text-right font-mono">
                <span className={transactionColor(t.transactionDescription)}>
                  {t.value !== null ? formatCurrency(Math.abs(t.value)) : '—'}
                </span>
              </td>
              <td className="px-5 py-3 text-right text-slate-400 tabular-nums hidden lg:table-cell">
                {fmtShares(t.ownership)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Institutional Ownership ───────────────────────────────────────────────────

function InstitutionalOwnership({ stocks }: { stocks: StockIntelligence[] }) {
  const stocksWithHolders = stocks.filter(
    (s) => s.topInstitutionalHolders.length > 0 || s.majorHolders !== null
  )

  if (stocksWithHolders.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-slate-500">
        No institutional ownership data available. This data applies to US-listed stocks and ETFs only.
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-800">
      {stocksWithHolders.map((s) => (
        <div key={s.symbol} className="px-5 py-5">
          {/* Stock header + major holders summary */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <span className="font-semibold text-slate-100">{s.symbol}</span>
              <span className="text-sm text-slate-500 ml-2">{s.name}</span>
            </div>
            {s.majorHolders && (
              <div className="flex gap-4 text-right flex-shrink-0">
                {s.majorHolders.insidersHeldPct !== null && (
                  <div>
                    <p className="text-xs text-slate-500">Insider Held</p>
                    <p className="text-sm font-semibold text-amber-400">{s.majorHolders.insidersHeldPct.toFixed(2)}%</p>
                  </div>
                )}
                {s.majorHolders.institutionsHeldPct !== null && (
                  <div>
                    <p className="text-xs text-slate-500">Institutional</p>
                    <p className="text-sm font-semibold text-indigo-400">{s.majorHolders.institutionsHeldPct.toFixed(2)}%</p>
                  </div>
                )}
                {s.majorHolders.institutionsCount !== null && (
                  <div>
                    <p className="text-xs text-slate-500"># Institutions</p>
                    <p className="text-sm font-semibold text-slate-300">{s.majorHolders.institutionsCount}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top holders table */}
          {s.topInstitutionalHolders.length > 0 && (
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/60">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Institution</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">% Held</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Shares</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Value</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Reported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {s.topInstitutionalHolders.map((h, j) => (
                    <tr key={j} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-slate-300">{h.organization}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {h.pctHeld !== null ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-800 hidden sm:block">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(h.pctHeld * 4, 100)}%` }}
                              />
                            </div>
                            <span className="text-indigo-300 font-medium">{h.pctHeld.toFixed(2)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums font-mono">
                        {fmtShares(h.shares)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums font-mono hidden md:table-cell">
                        {h.value !== null ? formatCurrency(h.value) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 hidden lg:table-cell">
                        {h.dateReported
                          ? new Date(h.dateReported).toLocaleDateString([], { month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MarketIntelligenceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Step 1: get all held symbols (stocks/ETFs/bonds only — no crypto, no cash)
      const holdingsRes = await fetch('/api/holdings')
      const holdingsJson: HoldingsResponse = await holdingsRes.json()
      const symbols = [
        ...new Set(
          (holdingsJson.data ?? [])
            .filter((h) => ['STOCK', 'ETF', 'BOND'].includes(h.assetClass))
            .map((h) => h.symbol)
        ),
      ]

      if (symbols.length === 0) {
        setError('No stock/ETF/bond holdings found. Add some holdings first.')
        return
      }

      // Step 2: fetch market intelligence
      const res = await fetch(`/api/market-intelligence?symbols=${symbols.join(',')}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Server error ${res.status}`)
      }
      const json: MarketIntelligenceResponse = await res.json()
      setData(json)
      setLastFetched(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market intelligence')
    } finally {
      setLoading(false)
    }
  }

  const stocks = data ? Object.values(data.stocks) : []

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Research" />

      <main className="flex-1 p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400 max-w-lg">
              Deep-dive market intelligence for your held positions. Earnings calendar, insider
              activity, and institutional ownership flows — all sourced from Yahoo Finance.
            </p>
            {lastFetched && (
              <p className="text-xs text-slate-600 mt-1">
                Last loaded {new Date(lastFetched).toLocaleString()}
                {' '}· Data cached for 30 minutes
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={data ? 'outline' : 'default'}
            className="gap-2 flex-shrink-0"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : data ? 'Refresh' : 'Load Intelligence'}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-800/40 bg-rose-900/10 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !data && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="grid grid-cols-3 gap-3 mb-2">
              {[Calendar, Activity, Building2].map((Icon, i) => (
                <div key={i} className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 ring-1 ring-slate-700">
                  <Icon className="h-6 w-6 text-slate-500" />
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">No intelligence loaded yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Click "Load Intelligence" to fetch earnings calendars, insider transactions,
                and institutional ownership data for all your stock and ETF positions.
              </p>
            </div>
            <Button size="sm" className="gap-2" onClick={load}>
              <Activity className="h-3.5 w-3.5" />
              Load Intelligence
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-800 p-5 space-y-3">
                <div className="h-4 w-48 rounded bg-slate-800 animate-pulse" />
                <div className="h-24 rounded bg-slate-800/60 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && data && stocks.length > 0 && (
          <>
            {/* Earnings Calendar */}
            <Section
              icon={<Calendar className="h-5 w-5" />}
              title="Earnings Calendar"
              subtitle="EPS estimates and reporting dates for your held positions"
              defaultOpen={true}
            >
              <EarningsCalendar stocks={stocks} />
            </Section>

            {/* Insider Trades */}
            <Section
              icon={<Activity className="h-5 w-5" />}
              title="Insider Trades"
              subtitle="Recent buying and selling by company executives and directors"
              defaultOpen={true}
            >
              <InsiderTrades stocks={stocks} />
            </Section>

            {/* Institutional Ownership */}
            <Section
              icon={<Building2 className="h-5 w-5" />}
              title="Institutional Ownership"
              subtitle="Top institutional holders and insider vs. institution ownership breakdown"
              defaultOpen={true}
            >
              <InstitutionalOwnership stocks={stocks} />
            </Section>

            {/* API errors (partial data) */}
            {data.errors.length > 0 && (
              <div className="rounded-lg border border-amber-800/30 bg-amber-900/10 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-3.5 w-3.5 text-amber-400" />
                  <p className="text-xs font-medium text-amber-400">Some symbols returned partial data:</p>
                </div>
                <ul className="space-y-0.5 pl-5">
                  {data.errors.map((e, i) => (
                    <li key={i} className="text-xs text-amber-300/70 list-disc">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* No stocks after load */}
        {!loading && data && stocks.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center">
            <p className="text-sm text-slate-400">
              No stock or ETF intelligence was returned. The symbols may not be found on Yahoo Finance,
              or all your equity positions are TASE-listed with limited coverage.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
