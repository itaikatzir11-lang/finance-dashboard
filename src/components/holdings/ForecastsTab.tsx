'use client'

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  BarChart3,
  Bitcoin,
  Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent } from '@/lib/utils'

// ── Types (mirror the backend response shape) ─────────────────────────────────

interface RecommendationTrend {
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
  total: number
}

interface AnalystAction {
  firm: string
  action: string
  fromGrade: string
  toGrade: string
  date: string
}

interface StockIntelligence {
  symbol: string
  name: string
  exchange: string
  currency: string
  currentPrice: number
  targetHigh: number | null
  targetLow: number | null
  targetMean: number | null
  targetMedian: number | null
  upsideMean: number | null
  upsideHigh: number | null
  upsideLow: number | null
  recommendationKey: string
  recommendationLabel: string
  recommendationMean: number | null
  analystCount: number
  currentTrend: RecommendationTrend | null
  previousMonthTrend: RecommendationTrend | null
  recentActions: AnalystAction[]
  earningsGrowthCurrentYear: number | null
  earningsGrowthNextYear: number | null
  trailingPE: number | null
  forwardPE: number | null
  beta: number | null
  marketCap: number | null
  dividendYield: number | null
  week52High: number | null
  week52Low: number | null
  week52HighPercent: number | null
  dataQuality: 'full' | 'partial' | 'price_only'
}

interface CryptoIntelligence {
  symbol: string
  name: string
  coinId: string
  currentPrice: number
  marketCapRank: number | null
  priceChange7d: number | null
  priceChange30d: number | null
  priceChange1y: number | null
  ath: number | null
  athChangePercent: number | null
  sentimentVotesUp: number | null
}

interface FearGreedReading {
  value: number
  classification: string
  date: string
}

interface FearGreedIndex {
  current: FearGreedReading
  yesterday: FearGreedReading | null
  lastWeek: FearGreedReading | null
}

interface ForecastsSummary {
  totalSymbols: number
  stockSymbols: number
  cryptoSymbols: number
  bullish: number
  neutral: number
  bearish: number
  avgUpsidePct: number | null
  highConvictionBuys: number
}

interface ForecastsData {
  stocks: StockIntelligence[]
  crypto: CryptoIntelligence[]
  fearGreed: FearGreedIndex | null
  summary: ForecastsSummary
  metadata: {
    symbolCount: number
    fetchedAt: string
    errors: string[]
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ratingColor(key: string): string {
  if (key === 'strongBuy') return 'text-emerald-400 bg-emerald-900/30 border-emerald-800/50'
  if (key === 'buy') return 'text-green-400 bg-green-900/20 border-green-800/40'
  if (key === 'hold') return 'text-amber-400 bg-amber-900/20 border-amber-800/40'
  if (key === 'underperform') return 'text-orange-400 bg-orange-900/20 border-orange-800/40'
  if (key === 'sell') return 'text-rose-400 bg-rose-900/20 border-rose-800/40'
  return 'text-slate-400 bg-slate-800/40 border-slate-700/50'
}

function ratingIcon(key: string) {
  if (key === 'strongBuy' || key === 'buy') return <TrendingUp className="h-3 w-3" />
  if (key === 'sell' || key === 'underperform') return <TrendingDown className="h-3 w-3" />
  return <Minus className="h-3 w-3" />
}

function pctColor(v: number | null): string {
  if (v === null) return 'text-slate-500'
  return v >= 0 ? 'text-emerald-400' : 'text-rose-400'
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function fmtNumber(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

function fearGreedColor(value: number): string {
  if (value >= 75) return 'text-emerald-400'
  if (value >= 55) return 'text-green-400'
  if (value >= 45) return 'text-slate-300'
  if (value >= 25) return 'text-amber-400'
  return 'text-rose-400'
}

// ── Fear & Greed Gauge ────────────────────────────────────────────────────────

function FearGreedGauge({ data }: { data: FearGreedIndex }) {
  const { current, yesterday, lastWeek } = data
  const pct = current.value / 100

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 flex items-center gap-6">
      <div className="flex items-center justify-center h-14 w-14 rounded-full border-4 border-slate-700 relative flex-shrink-0">
        <Gauge className="h-7 w-7 text-slate-600 absolute" />
        <span className={`text-sm font-bold tabular-nums z-10 ${fearGreedColor(current.value)}`}>
          {current.value}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Crypto Fear & Greed</p>
        <p className={`text-base font-semibold ${fearGreedColor(current.value)}`}>
          {current.classification}
        </p>
        <div className="flex gap-3 mt-1">
          {yesterday && (
            <span className="text-[11px] text-slate-500">
              Yesterday: <span className={fearGreedColor(yesterday.value)}>{yesterday.value}</span>
            </span>
          )}
          {lastWeek && (
            <span className="text-[11px] text-slate-500">
              Last week: <span className={fearGreedColor(lastWeek.value)}>{lastWeek.value}</span>
            </span>
          )}
        </div>
      </div>
      {/* Gradient bar */}
      <div className="flex-1 hidden sm:block">
        <div className="h-2.5 rounded-full bg-gradient-to-r from-rose-600 via-amber-400 to-emerald-500 relative">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md"
            style={{ left: `calc(${pct * 100}% - 8px)`, backgroundColor: 'white' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-rose-400">Extreme Fear</span>
          <span className="text-[10px] text-slate-500">Neutral</span>
          <span className="text-[10px] text-emerald-400">Extreme Greed</span>
        </div>
      </div>
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: ForecastsSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Analyst Upside</p>
        <p className={`text-xl font-bold tabular-nums ${summary.avgUpsidePct === null ? 'text-slate-500' : summary.avgUpsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {summary.avgUpsidePct === null ? '—' : fmtPct(summary.avgUpsidePct)}
        </p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">High-Conviction Buys</p>
        <p className="text-xl font-bold tabular-nums text-indigo-400">{summary.highConvictionBuys}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">≥10% upside potential</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Bullish Signals</p>
        <p className="text-xl font-bold tabular-nums text-emerald-400">{summary.bullish}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">of {summary.totalSymbols} symbols</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Bearish Signals</p>
        <p className="text-xl font-bold tabular-nums text-rose-400">{summary.bearish}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">of {summary.totalSymbols} symbols</p>
      </div>
    </div>
  )
}

// ── Stocks Table ──────────────────────────────────────────────────────────────

function StocksTable({ stocks }: { stocks: StockIntelligence[] }) {
  if (stocks.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-200">Stocks & ETFs — Analyst Intelligence</h3>
        <span className="text-xs text-slate-500">({stocks.length} symbols)</span>
      </div>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Current</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Upside</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Consensus</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Analysts</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Fwd P/E</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden xl:table-cell">Beta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {stocks.map((s) => (
              <tr key={s.symbol} className="bg-slate-900 hover:bg-slate-800/60 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <span className="font-semibold text-slate-100">{s.symbol}</span>
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[140px]">{s.name}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {formatCurrency(s.currentPrice)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {s.targetMean !== null ? (
                    <div>
                      <span className="text-slate-200">{formatCurrency(s.targetMean)}</span>
                      {s.targetLow !== null && s.targetHigh !== null && (
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {formatCurrency(s.targetLow)} – {formatCurrency(s.targetHigh)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold tabular-nums ${pctColor(s.upsideMean)}`}>
                    {fmtPct(s.upsideMean)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${ratingColor(s.recommendationKey)}`}>
                    {ratingIcon(s.recommendationKey)}
                    {s.recommendationLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-400 hidden lg:table-cell">
                  {s.analystCount > 0 ? s.analystCount : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 tabular-nums hidden lg:table-cell">
                  {s.forwardPE !== null ? s.forwardPE.toFixed(1) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 tabular-nums hidden xl:table-cell">
                  {s.beta !== null ? s.beta.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent analyst actions */}
      {stocks.some((s) => s.recentActions?.length > 0) && (
        <div className="mt-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Recent Upgrades / Downgrades</p>
          <div className="space-y-1.5">
            {stocks
              .flatMap((s) => s.recentActions.map((a) => ({ ...a, symbol: s.symbol })))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 6)
              .map((a, i) => {
                const isUp = a.action === 'up'
                const isDown = a.action === 'down'
                return (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`font-semibold w-12 ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400'}`}>
                      {a.symbol}
                    </span>
                    <span className="text-slate-600">{a.firm}</span>
                    <span>
                      {a.fromGrade && a.toGrade ? `${a.fromGrade} → ${a.toGrade}` : a.action}
                    </span>
                    <span className="ml-auto text-slate-600">
                      {new Date(a.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Crypto Table ──────────────────────────────────────────────────────────────

function CryptoTable({ crypto }: { crypto: CryptoIntelligence[] }) {
  if (crypto.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Bitcoin className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-200">Crypto — Market Intelligence</h3>
        <span className="text-xs text-slate-500">({crypto.length} assets)</span>
      </div>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Asset</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Current</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">7d %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">30d %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">1y %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">ATH Gap</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Rank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {crypto.map((c) => (
              <tr key={c.symbol} className="bg-slate-900 hover:bg-slate-800/60 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <span className="font-semibold text-slate-100">{c.symbol}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{c.name}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {formatCurrency(c.currentPrice)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${pctColor(c.priceChange7d)}`}>
                  {fmtPct(c.priceChange7d)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${pctColor(c.priceChange30d)}`}>
                  {fmtPct(c.priceChange30d)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums hidden lg:table-cell ${pctColor(c.priceChange1y)}`}>
                  {fmtPct(c.priceChange1y, 0)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums hidden lg:table-cell ${pctColor(c.athChangePercent)}`}>
                  {c.athChangePercent !== null
                    ? `${c.athChangePercent.toFixed(1)}% from ATH`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 hidden lg:table-cell">
                  {c.marketCapRank !== null ? `#${c.marketCapRank}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ForecastsTab() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ForecastsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/forecasts')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json: ForecastsData = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forecasts')
    } finally {
      setLoading(false)
    }
  }

  const isEmpty = data && data.stocks.length === 0 && data.crypto.length === 0

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Analyst price targets, consensus ratings, and crypto market intelligence for your held assets.
          </p>
          {data?.metadata.fetchedAt && (
            <p className="text-xs text-slate-600 mt-0.5">
              Data fetched {new Date(data.metadata.fetchedAt).toLocaleString()}
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
          {loading ? 'Loading…' : data ? 'Refresh' : 'Load Forecasts'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-800/40 bg-rose-900/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {/* Empty state — before first load */}
      {!loading && !error && !data && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700">
            <BarChart3 className="h-7 w-7 text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">No forecast data loaded</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Click "Load Forecasts" to fetch live analyst targets and consensus ratings from
              Yahoo Finance, plus crypto momentum data from CoinGecko.
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={load}>
            <BarChart3 className="h-3.5 w-3.5" />
            Load Forecasts
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 py-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* No holdings to show */}
      {!loading && isEmpty && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center">
          <p className="text-sm text-slate-400">
            No investable holdings found. Add stocks, ETFs, or crypto to see analyst intelligence here.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && data && !isEmpty && (
        <>
          {/* Summary cards */}
          <SummaryBar summary={data.summary} />

          {/* Fear & Greed */}
          {data.fearGreed && <FearGreedGauge data={data.fearGreed} />}

          {/* Stocks */}
          {data.stocks.length > 0 && <StocksTable stocks={data.stocks} />}

          {/* Crypto */}
          {data.crypto.length > 0 && <CryptoTable crypto={data.crypto} />}

          {/* API errors (partial data) */}
          {data.metadata.errors.length > 0 && (
            <div className="rounded-lg border border-amber-800/30 bg-amber-900/10 px-4 py-3">
              <p className="text-xs font-medium text-amber-400 mb-1">Some data could not be fetched:</p>
              <ul className="space-y-0.5">
                {data.metadata.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-300/70">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
