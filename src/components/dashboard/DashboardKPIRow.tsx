'use client'

import { useEffect, useState } from 'react'
import { Layers, TrendingUp, TrendingDown, Trophy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { HoldingWithAccount, HoldingsResponse } from '@/types'

interface KPICardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: React.ReactNode
  iconBg: string
  /** Full Tailwind bg class for the top accent bar, e.g. "bg-indigo-500" */
  accentBar: string
  loading?: boolean
}

function KPICard({ label, value, sub, icon, iconBg, accentBar, loading }: KPICardProps) {
  return (
    <Card className="hover:-translate-y-0.5 transition-all duration-200 cursor-default overflow-hidden">
      {/* Colored top accent stripe */}
      <div className={`h-[2px] w-full ${accentBar} opacity-70`} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
          <div className={`h-7 w-7 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
        </div>
        {loading ? (
          <div className="space-y-1.5 animate-pulse">
            <div className="h-5 w-24 rounded bg-white/[0.06]" />
            <div className="h-3 w-16 rounded bg-white/[0.04]" />
          </div>
        ) : (
          <>
            <div className="text-xl font-bold tabular-nums tracking-tighter leading-tight">{value}</div>
            {sub && (
              <div className="text-[11px] text-slate-600 mt-1.5 truncate font-medium tracking-tight">
                {sub}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardKPIRow() {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const { usdToIls } = useFxRate()

  useEffect(() => {
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((res: HoldingsResponse) => setHoldings(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const active = holdings.filter((h) => h.quantity > 0)

  // Best daily performer (by absolute %)
  const bestToday = [...active].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0]

  // Total unrealized P&L in ILS
  const pnlHoldings = active.filter((h) => h.avgCostBasis != null)
  const totalGainLossIls = pnlHoldings.reduce((sum, h) => {
    const gl = (h.currentPrice - h.avgCostBasis!) * h.quantity
    return sum + (h.currency === 'ILS' ? gl : gl * usdToIls)
  }, 0)
  const hasGainLoss = pnlHoldings.length > 0

  // Largest single position
  const toIls = (h: HoldingWithAccount) =>
    h.currency === 'ILS' ? h.currentValue : h.currentValue * usdToIls
  const totalPortfolioIls = active.reduce((s, h) => s + toIls(h), 0)
  const largest = [...active].sort((a, b) => toIls(b) - toIls(a))[0]
  const largestPct = largest && totalPortfolioIls > 0 ? (toIls(largest) / totalPortfolioIls) * 100 : 0

  const gainLossColor = totalGainLossIls >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const gainLossBg    = totalGainLossIls >= 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15'
  const gainLossIcon  = totalGainLossIls >= 0
    ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
    : <TrendingDown className="h-3.5 w-3.5 text-rose-400" />

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Positions count */}
      <KPICard
        label="Open Positions"
        value={<span className="text-white">{active.length}</span>}
        sub={`${holdings.length} total holdings`}
        icon={<Layers className="h-3.5 w-3.5 text-indigo-400" />}
        iconBg="bg-indigo-500/15"
        accentBar="bg-indigo-500"
        loading={loading}
      />

      {/* Best mover today */}
      <KPICard
        label="Best Today"
        value={
          bestToday ? (
            <span className={getChangeColor(bestToday.dailyChangePercent)}>
              {bestToday.symbol}{' '}
              {bestToday.dailyChangePercent >= 0 ? '+' : ''}
              {formatPercent(bestToday.dailyChangePercent)}
            </span>
          ) : (
            <span className="text-slate-500">—</span>
          )
        }
        sub={bestToday?.name ?? 'No data'}
        icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
        iconBg="bg-emerald-500/15"
        accentBar="bg-emerald-500"
        loading={loading}
      />

      {/* Unrealized P&L */}
      <KPICard
        label="Unrealized P&L"
        value={
          hasGainLoss ? (
            <span className={gainLossColor}>
              {totalGainLossIls >= 0 ? '+' : ''}
              {formatCurrency(Math.abs(totalGainLossIls), 'ILS')}
            </span>
          ) : (
            <span className="text-slate-500 text-sm font-medium">No cost basis</span>
          )
        }
        sub={
          hasGainLoss
            ? `across ${pnlHoldings.length} position${pnlHoldings.length !== 1 ? 's' : ''}`
            : 'Add avg cost to track gains'
        }
        icon={gainLossIcon}
        iconBg={gainLossBg}
        accentBar={totalGainLossIls >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
        loading={loading}
      />

      {/* Top position */}
      <KPICard
        label="Top Position"
        value={
          largest ? (
            <span className="text-white">{largest.symbol}</span>
          ) : (
            <span className="text-slate-500">—</span>
          )
        }
        sub={
          largest
            ? `${largestPct.toFixed(1)}% of portfolio · ${formatCurrency(toIls(largest), 'ILS')}`
            : undefined
        }
        icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
        iconBg="bg-amber-500/15"
        accentBar="bg-amber-500"
        loading={loading}
      />
    </div>
  )
}
