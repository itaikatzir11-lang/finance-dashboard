'use client'

import { useState } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  BarChart3,
  PiggyBank,
  Lightbulb,
  Star,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioRecommendation {
  type: 'קנה' | 'מכור' | 'החזק'
  asset: string
  rationale: string
}

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
  concentrationHHI: number
  top1Pct: number
  top3Pct: number
  ilsExposureUsd: number
  ilsExposurePct: number
  unrealizedPnlUsd: number | null
  unrealizedPnlPct: number | null
  change30dUsd: number | null
  change30dPct: number | null
  holdingCount: number
  brokerageCashUsd: number
}

interface InsightsData {
  available: boolean
  summary?: string
  allocationAnalysis?: string
  pensionCorrelation?: string
  recommendations?: PortfolioRecommendation[]
  monthlyAction?: string
  portfolioMetrics?: PortfolioMetrics
  generatedAt?: string
  message?: string
}

// ── Recommendation config — only these three use accent color ─────────────────

const REC_CONFIG = {
  קנה: {
    label: 'Buy',
    icon: TrendingUp,
    badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
    borderColor: 'border-l-emerald-500/70',
  },
  מכור: {
    label: 'Sell',
    icon: TrendingDown,
    badge: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
    borderColor: 'border-l-rose-500/70',
  },
  החזק: {
    label: 'Hold',
    icon: Minus,
    badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
    borderColor: 'border-l-amber-500/70',
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(usd: number): string {
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (Math.abs(usd) >= 1_000)     return `$${(usd / 1_000).toFixed(1)}k`
  return `$${Math.round(usd)}`
}

function signed(val: number | null, fmt: (v: number) => string): string {
  if (val === null) return '—'
  return `${val >= 0 ? '+' : ''}${fmt(val)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-indigo-500/80">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function MetricTile({
  label,
  value,
  sub,
  valueColor = 'text-slate-100',
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.07] px-3.5 py-3 hover:bg-white/[0.04] transition-colors duration-150 cursor-default">
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-semibold tracking-tighter tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}

function MetricsBar({ metrics }: { metrics: PortfolioMetrics }) {
  const pnlPos = metrics.unrealizedPnlUsd !== null && metrics.unrealizedPnlUsd >= 0
  const pnlColor = metrics.unrealizedPnlUsd === null ? 'text-slate-500' : pnlPos ? 'text-emerald-400' : 'text-rose-400'

  const chg30Pos = metrics.change30dUsd !== null && metrics.change30dUsd >= 0
  const chg30Color = metrics.change30dUsd === null ? 'text-slate-500' : chg30Pos ? 'text-emerald-400' : 'text-rose-400'

  const hhi = metrics.concentrationHHI
  const hhiColor = hhi > 2500 ? 'text-amber-400' : 'text-emerald-400'

  const totalCashUsd = metrics.bankUsd + metrics.brokerageCashUsd

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricTile
        label="Total (USD)"
        value={formatCurrency(metrics.totalNetWorthUsd)}
        sub={`${metrics.holdingCount} positions`}
      />
      <MetricTile
        label="Cash"
        value={fmtK(totalCashUsd)}
        sub={metrics.brokerageCashUsd > 0
          ? `Bank ${fmtK(metrics.bankUsd)} · Broker ${fmtK(metrics.brokerageCashUsd)}`
          : `Bank ${fmtK(metrics.bankUsd)}`}
      />
      <MetricTile
        label="Unrealised P&L"
        value={signed(metrics.unrealizedPnlUsd, formatCurrency)}
        sub={metrics.unrealizedPnlPct !== null
          ? signed(metrics.unrealizedPnlPct, (v) => `${Math.abs(v).toFixed(1)}%`)
          : undefined}
        valueColor={pnlColor}
      />
      <MetricTile
        label="30d Change"
        value={signed(metrics.change30dUsd, formatCurrency)}
        sub={metrics.change30dPct !== null
          ? signed(metrics.change30dPct, (v) => `${Math.abs(v).toFixed(1)}%`)
          : undefined}
        valueColor={chg30Color}
      />
      <MetricTile
        label="Concentration"
        value={`HHI ${hhi.toLocaleString()}`}
        sub={`Top 3: ${metrics.top3Pct.toFixed(1)}% · ILS: ${metrics.ilsExposurePct.toFixed(1)}%`}
        valueColor={hhiColor}
      />
    </div>
  )
}

function RecommendationCard({ rec }: { rec: PortfolioRecommendation }) {
  const cfg = REC_CONFIG[rec.type]
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] border-l-[3px] ${cfg.borderColor} px-4 py-3.5 hover:-translate-y-px transition-all duration-200`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
          <Icon className="h-2.5 w-2.5" />
          {cfg.label}
        </span>
        <span className="text-[13px] font-semibold text-slate-200" dir="auto">{rec.asset}</span>
      </div>
      <p className="text-[13px] text-slate-400 leading-relaxed" dir="rtl">{rec.rationale}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center gap-3 text-indigo-400/70">
        <Sparkles className="h-4 w-4 animate-pulse flex-shrink-0" />
        <span className="text-[13px] text-slate-400">Claude is reading your portfolio and market data…</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[60px] rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <div className="h-2.5 rounded-full bg-white/[0.04] animate-pulse w-full" />
        <div className="h-2.5 rounded-full bg-white/[0.04] animate-pulse w-5/6" />
        <div className="h-2.5 rounded-full bg-white/[0.04] animate-pulse w-4/6" />
      </div>
      <div className="space-y-2">
        <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIInsightsPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<InsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    setIsOpen(true)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-insights', { method: 'POST' })
      const json: InsightsData = await res.json()
      if (!json.available) {
        setError(json.message ?? 'AI analysis is not available.')
      } else {
        setData(json)
      }
    } catch {
      setError('Network error — could not reach the analysis server.')
    } finally {
      setLoading(false)
    }
  }

  const hasData = data !== null && !loading

  return (
    /* Outer glow wrapper — positions the Stripe-style bloom behind the panel */
    <div className="relative">
      {/* Diffused indigo bloom — Stripe signature effect */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-56 rounded-full"
        style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.07) 0%, transparent 70%)', filter: 'blur(24px)' }}
      />

      <div className="relative rounded-2xl bg-[#080B15] ring-1 ring-white/[0.08] overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
          onClick={() => setIsOpen((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/[0.12] ring-1 ring-indigo-500/25">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-slate-200 tracking-tight">AI Portfolio Analysis</h2>
              {data?.generatedAt && !loading && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Generated {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
            {loading ? (
              <div className="flex items-center gap-2 text-[12px] text-indigo-400/80 pr-1">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Analyzing…</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant={data ? 'outline' : 'default'}
                className={`gap-1.5 text-xs h-7 ${
                  data
                    ? 'border-white/[0.1] text-slate-400 hover:text-white hover:bg-white/[0.05] bg-transparent'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent'
                }`}
                onClick={analyze}
              >
                {data
                  ? <><RefreshCw className="h-3 w-3" /> Regenerate</>
                  : <><Sparkles className="h-3 w-3" /> Analyze Portfolio</>}
              </Button>
            )}

            <button
              className="text-slate-600 hover:text-slate-300 transition-colors"
              onClick={() => setIsOpen((v) => !v)}
              aria-label="Toggle panel"
            >
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        {isOpen && (
          <div className="px-6 pb-6 border-t border-white/[0.05] pt-5 space-y-6">

            {loading && <LoadingSkeleton />}

            {!loading && error && (
              <div className="flex items-start gap-3 rounded-xl bg-rose-500/[0.06] ring-1 ring-rose-500/[0.15] px-4 py-3.5">
                <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
                <p className="text-[13px] text-rose-300/90">{error}</p>
              </div>
            )}

            {!loading && !error && !hasData && (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/[0.08] ring-1 ring-indigo-500/20">
                  <Sparkles className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-slate-300">No analysis yet</p>
                  <p className="text-[12px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                    Get a data-driven Hebrew review of your portfolio — allocation health,
                    risk flags, and specific Buy / Sell / Hold recommendations.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white border-transparent gap-1.5 mt-1"
                  onClick={analyze}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze Portfolio
                </Button>
              </div>
            )}

            {!loading && hasData && data && (
              <div className="space-y-6">

                {/* Metrics bar */}
                {data.portfolioMetrics && <MetricsBar metrics={data.portfolioMetrics} />}

                {/* Thin divider */}
                <div className="border-t border-white/[0.05]" />

                {/* Portfolio summary */}
                {data.summary && (
                  <Section icon={<TrendingUp className="h-3.5 w-3.5" />} title="Portfolio Overview">
                    <p className="text-[13px] leading-relaxed text-slate-400 text-right" dir="rtl">
                      {data.summary}
                    </p>
                  </Section>
                )}

                {/* Allocation analysis */}
                {data.allocationAnalysis && (
                  <Section icon={<BarChart3 className="h-3.5 w-3.5" />} title="Allocation Health">
                    <p className="text-[13px] leading-relaxed text-slate-400 text-right" dir="rtl">
                      {data.allocationAnalysis}
                    </p>
                  </Section>
                )}

                {/* Pension correlation */}
                {data.pensionCorrelation && (
                  <Section icon={<PiggyBank className="h-3.5 w-3.5" />} title="Pension & S&P 500">
                    <p className="text-[13px] leading-relaxed text-slate-400 text-right" dir="rtl">
                      {data.pensionCorrelation}
                    </p>
                  </Section>
                )}

                {/* Recommendations */}
                {data.recommendations && data.recommendations.length > 0 && (
                  <Section icon={<Lightbulb className="h-3.5 w-3.5" />} title="Recommendations">
                    <div className="space-y-2">
                      {data.recommendations.map((rec, i) => (
                        <RecommendationCard key={i} rec={rec} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Monthly action — premium CTA with inner glow */}
                {data.monthlyAction && (
                  <div className="relative rounded-xl overflow-hidden bg-indigo-950/[0.5] ring-1 ring-indigo-500/[0.18] px-5 py-4 flex items-start gap-3">
                    {/* Inner corner glow */}
                    <div
                      className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full"
                      style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }}
                    />
                    <Star className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0 relative" />
                    <div className="relative">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/80 mb-1.5">
                        Action This Month
                      </p>
                      <p className="text-[13px] text-indigo-100/90 leading-relaxed text-right" dir="rtl">
                        {data.monthlyAction}
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {data.generatedAt && (
                  <p className="text-[11px] text-slate-700 pt-1">
                    Analysis generated at {new Date(data.generatedAt).toLocaleString()}
                    {' · '}Powered by Claude claude-sonnet-4-6
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
