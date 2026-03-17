'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Banknote, Bitcoin, BarChart3, Landmark, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { AnimatedCount } from '@/components/ui/animated-count'
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { NetWorthSummary } from '@/types'

const EMPTY: NetWorthSummary = {
  total: 0,
  breakdown: { cash: 0, crypto: 0, capitalMarket: 0, pension: 0 },
  dailyChange: 0,
  dailyChangePercent: 0,
  dataSource: 'mock',
}

interface BreakdownCardProps {
  label: string
  valueIls: number
  icon: React.ReactNode
  /** Background color class for the icon swatch, e.g. "bg-emerald-500/20" */
  iconBg: string
  /** Explicit bar color class for the progress bar, e.g. "bg-emerald-500" */
  barColor: string
  percent: number
  /** Optional subtitle line rendered below the value (e.g. "Bank: ₪X · Brokerage: ₪Y") */
  subtitle?: string
}

function BreakdownCard({ label, valueIls, icon, iconBg, barColor, percent, subtitle }: BreakdownCardProps) {
  return (
    <Card className="flex-1 min-w-0 hover:-translate-y-0.5 hover:ring-white/[0.1] transition-all duration-200 cursor-default overflow-hidden">
      {/* Colored top accent stripe matching bar color */}
      <div className={`h-[2px] w-full ${barColor} opacity-60`} />
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.12em]">{label}</span>
          <div className={`h-7 w-7 rounded-lg ${iconBg} flex items-center justify-center`}>
            {icon}
          </div>
        </div>

        {/* Value + allocation % side by side */}
        <div className="flex items-end justify-between gap-1">
          <div className="text-xl font-bold text-white tabular-nums tracking-tighter leading-none">
            <AnimatedCount value={valueIls} formatter={(v) => formatCurrency(v, 'ILS')} />
          </div>
          {percent > 0 && (
            <div className="text-[22px] font-bold tabular-nums tracking-tighter leading-none text-white/[0.12] select-none">
              {percent.toFixed(0)}%
            </div>
          )}
        </div>

        {/* Subtitle */}
        {subtitle ? (
          <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">{subtitle}</div>
        ) : (
          <div className="text-[11px] text-slate-600 mt-1.5 tabular-nums">
            {percent.toFixed(1)}% of portfolio
          </div>
        )}

        {/* Mini progress bar */}
        <div className="mt-3 h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function NetWorthCard() {
  const [data, setData] = useState<NetWorthSummary>(EMPTY)
  const [loading, setLoading] = useState(true)
  const { usdToIls } = useFxRate()

  useEffect(() => {
    fetch('/api/net-worth')
      .then((r) => r.json())
      .then((d: NetWorthSummary) => setData(d))
      .catch(() => {/* keep EMPTY/mock */})
      .finally(() => setLoading(false))
  }, [])

  const isMock = data.dataSource === 'mock'

  // All values from /api/net-worth are in USD. Multiply by usdToIls to display in ₪.
  const totalIls           = data.total                         * usdToIls
  const dailyChangeIls     = data.dailyChange                   * usdToIls
  const cashIls            = data.breakdown.cash                * usdToIls
  const brokerageCashIls   = (data.breakdown.brokerageCash ?? 0) * usdToIls
  const bankCashIls        = cashIls - brokerageCashIls
  const cryptoIls          = data.breakdown.crypto              * usdToIls
  const capitalMarketIls   = data.breakdown.capitalMarket       * usdToIls
  const pensionIls         = data.breakdown.pension             * usdToIls

  const changeColor = getChangeColor(data.dailyChange)
  const isPositive  = data.dailyChange >= 0

  const cashPct          = totalIls > 0 ? (cashIls          / totalIls) * 100 : 0
  const cryptoPct        = totalIls > 0 ? (cryptoIls        / totalIls) * 100 : 0
  const capitalMarketPct = totalIls > 0 ? (capitalMarketIls / totalIls) * 100 : 0
  const pensionPct       = totalIls > 0 ? (pensionIls       / totalIls) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Main net worth display */}
      <Card className="overflow-hidden">
        {/* Top gradient accent stripe */}
        <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />

        {isMock && !loading && (
          <div className="flex items-center gap-2 px-6 py-2.5 border-b border-white/[0.05] bg-amber-500/[0.04]">
            <AlertTriangle className="h-3 w-3 text-amber-500/80 flex-shrink-0" />
            <p className="text-[11px] text-amber-500/70">
              Sample data — database not connected. Connect PostgreSQL and run sync to see real values.
            </p>
          </div>
        )}

        <CardContent className="p-6 lg:p-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">

              {/* Label row — ticker style */}
              <div className="flex items-center gap-2.5 mb-4">
                {!isMock ? (
                  /* Pulsing live indicator */
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-700 flex-shrink-0" />
                )}
                <p className="text-[11px] text-slate-200 font-bold uppercase tracking-[0.14em]">
                  Portfolio Value
                </p>
                {!isMock && (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/80 bg-emerald-500/[0.08] border border-emerald-500/[0.2] px-1.5 py-[2px] rounded">
                    LIVE
                  </span>
                )}
              </div>

              {/* Main value — large and commanding */}
              <div
                className={`tabular-nums tracking-tighter transition-opacity ${
                  loading ? 'opacity-30' : 'opacity-100'
                }`}
              >
                <AnimatedCount
                  value={totalIls}
                  formatter={(v) => formatCurrency(v, 'ILS')}
                  className="text-gradient text-5xl lg:text-6xl font-extrabold"
                />
              </div>

              {/* USD sub-value */}
              {!loading && totalIls > 0 && (
                <div className="text-[13px] text-slate-500 mt-2 tabular-nums font-medium tracking-tight">
                  ≈ {formatCurrency(data.total, 'USD')}
                </div>
              )}

              {/* Daily change pill */}
              {!isMock && (
                <div className={`inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-lg border tabular-nums ${
                  isPositive
                    ? 'bg-emerald-500/[0.07] border-emerald-500/[0.18] text-emerald-400'
                    : 'bg-rose-500/[0.07] border-rose-500/[0.18] text-rose-400'
                }`}>
                  {isPositive
                    ? <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" />
                    : <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" />
                  }
                  <span className="text-[13px] font-bold">
                    {isPositive ? '+' : ''}{formatCurrency(dailyChangeIls, 'ILS')}
                  </span>
                  <span className="text-[12px] font-semibold opacity-80">
                    {isPositive ? '+' : ''}{formatPercent(data.dailyChangePercent)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">today</span>
                </div>
              )}

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown cards */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <BreakdownCard
          label="Cash"
          valueIls={cashIls}
          icon={<Banknote className="h-3.5 w-3.5 text-emerald-400" />}
          iconBg="bg-emerald-500/15"
          barColor="bg-emerald-500"
          percent={cashPct}
          subtitle={cashIls > 0 ? `Bank: ${formatCurrency(bankCashIls, 'ILS')} · Brokerage: ${formatCurrency(brokerageCashIls, 'ILS')}` : undefined}
        />
        <BreakdownCard
          label="Crypto"
          valueIls={cryptoIls}
          icon={<Bitcoin className="h-3.5 w-3.5 text-orange-400" />}
          iconBg="bg-orange-500/15"
          barColor="bg-orange-500"
          percent={cryptoPct}
        />
        <BreakdownCard
          label="Capital Market"
          valueIls={capitalMarketIls}
          icon={<BarChart3 className="h-3.5 w-3.5 text-blue-400" />}
          iconBg="bg-blue-500/15"
          barColor="bg-blue-500"
          percent={capitalMarketPct}
        />
        <BreakdownCard
          label="Pension"
          valueIls={pensionIls}
          icon={<Landmark className="h-3.5 w-3.5 text-purple-400" />}
          iconBg="bg-purple-500/15"
          barColor="bg-purple-500"
          percent={pensionPct}
        />
      </div>
    </div>
  )
}
