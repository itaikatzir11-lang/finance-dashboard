'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { HoldingWithAccount, HoldingsResponse } from '@/types'


interface HoldingRowProps {
  holding: HoldingWithAccount
  usdToIls: number
}

function HoldingRow({ holding, usdToIls }: HoldingRowProps) {
  const isPositive = holding.dailyChangePercent >= 0
  const changeColor = getChangeColor(holding.dailyChangePercent)
  const dailyChangeNative = holding.currentValue * (holding.dailyChangePercent / 100)
  const dailyChangeIls = holding.currency === 'ILS' ? dailyChangeNative : dailyChangeNative * usdToIls

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800/50 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}
        >
          {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{holding.symbol}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {holding.assetClass.toLowerCase()}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">{holding.name}</p>
        </div>
      </div>

      <div className="text-right">
        <div className={`text-sm font-semibold ${changeColor}`}>
          {formatPercent(holding.dailyChangePercent)}
        </div>
        <div className={`text-xs ${changeColor}`}>
          {isPositive ? '+' : ''}{formatCurrency(dailyChangeIls, 'ILS')}
        </div>
      </div>
    </div>
  )
}

export function DailyChangeSummary() {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { usdToIls } = useFxRate()

  useEffect(() => {
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((res: HoldingsResponse) => {
        setHoldings(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  // Sort by abs change, show top movers
  const sorted = [...holdings]
    .filter((h) => h.assetClass !== 'CASH')
    .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
    .slice(0, 6)

  const totalDailyChangeIls = holdings.reduce((sum, h) => {
    const valueIls = h.currency === 'ILS' ? h.currentValue : h.currentValue * usdToIls
    return sum + valueIls * (h.dailyChangePercent / 100)
  }, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Today&apos;s Movers
          </CardTitle>
          <div className={`text-sm font-semibold ${getChangeColor(totalDailyChangeIls)}`}>
            {totalDailyChangeIls >= 0 ? '+' : ''}{formatCurrency(totalDailyChangeIls, 'ILS')} today
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-1">
            {[1,2,3].map(i => <div key={i} className="h-10 rounded bg-slate-800 animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-slate-500 py-4 text-center">Could not load holdings.</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No holdings yet. Add positions to see daily movers.</p>
        ) : (
          <div>
            {sorted.map((h) => (
              <HoldingRow key={h.id} holding={h} usdToIls={usdToIls} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
