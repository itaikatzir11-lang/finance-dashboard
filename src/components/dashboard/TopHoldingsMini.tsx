'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { HoldingWithAccount, HoldingsResponse } from '@/types'

const COLORS: Record<string, string> = {
  CRYPTO: '#f59e0b',
  BROKERAGE: '#6366f1',
  BANK: '#10b981',
}

export function TopHoldingsMini() {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [dataSource, setDataSource] = useState<'db' | 'mock' | null>(null)
  const [loading, setLoading] = useState(true)
  const { usdToIls } = useFxRate()

  useEffect(() => {
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((res: HoldingsResponse) => {
        setHoldings(Array.isArray(res.data) ? res.data : [])
        setDataSource(res.dataSource ?? 'db')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
        ))}
      </div>
    )
  }

  function holdingValueIls(h: HoldingWithAccount): number {
    return h.currency === 'ILS' ? h.currentValue : h.currentValue * usdToIls
  }

  const sorted = [...holdings]
    .filter((h) => h.assetClass !== 'CASH')
    .sort((a, b) => holdingValueIls(b) - holdingValueIls(a))
    .slice(0, 6)

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4 text-center">
        No holdings yet. Add positions to see top holdings.
      </p>
    )
  }

  const total = sorted.reduce((s, h) => s + holdingValueIls(h), 0)

  return (
    <div className="space-y-3">
      {dataSource === 'mock' && (
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-400">Sample data</p>
        </div>
      )}
      {sorted.map((h) => {
        const valueIls = holdingValueIls(h)
        const pct = total > 0 ? (valueIls / total) * 100 : 0
        const color = COLORS[h.assetClass] ?? '#64748b'
        return (
          <div key={h.id}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-slate-200">{h.symbol}</span>
                <span className="text-xs text-slate-500 hidden sm:inline">{h.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{pct.toFixed(1)}%</span>
                <span className="text-sm font-medium text-slate-100 tabular-nums">
                  {formatCurrency(valueIls, 'ILS')}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
