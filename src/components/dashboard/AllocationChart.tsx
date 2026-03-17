'use client'

import { useEffect, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, getAssetClassColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import { useChartTheme } from '@/hooks/useChartTheme'
import type { HoldingWithAccount, AllocationData, HoldingsResponse } from '@/types'

const ASSET_CLASS_LABELS: Record<string, string> = {
  STOCK_ETF: 'Stocks & ETF',
  CRYPTO:    'Crypto',
  CASH:      'Cash',
  BOND:      'Bonds',
  OTHER:     'Other',
}

/**
 * Convert each holding to ILS and group by asset class.
 * STOCK and ETF are merged into a single "Stocks & ETF" bucket.
 */
function buildAllocation(holdings: HoldingWithAccount[], usdToIls: number): AllocationData[] {
  const totals: Record<string, number> = {}
  let grandTotal = 0

  for (const h of holdings) {
    const ilsValue = h.currency === 'ILS' ? h.currentValue : h.currentValue * usdToIls
    // Merge STOCK and ETF into one bucket
    const key = (h.assetClass === 'STOCK' || h.assetClass === 'ETF') ? 'STOCK_ETF' : h.assetClass
    totals[key] = (totals[key] ?? 0) + ilsValue
    grandTotal += ilsValue
  }

  return Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .map(([assetClass, value]) => ({
      name: ASSET_CLASS_LABELS[assetClass] ?? (assetClass.charAt(0) + assetClass.slice(1).toLowerCase()),
      value,
      color: getAssetClassColor(assetClass),
      percent: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
    }))
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: AllocationData }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  const ct = useChartTheme()
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div
      className="rounded-xl backdrop-blur-md px-4 py-3 shadow-2xl min-w-[140px]"
      style={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}` }}
    >
      <p className="text-[11px] font-medium mb-1.5" style={{ color: ct.tooltipLabel }}>{item.name}</p>
      <p className="text-[15px] font-semibold tabular-nums tracking-tight" style={{ color: ct.tooltipText }}>
        {formatCurrency(item.value, 'ILS')}
      </p>
      <p className="text-[12px] tabular-nums mt-0.5" style={{ color: ct.axis }}>{item.percent.toFixed(1)}% of portfolio</p>
    </div>
  )
}

interface LegendItemProps {
  name: string
  value: number
  color: string
  percent: number
}

function LegendItem({ name, value, color, percent }: LegendItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-1 rounded-md hover:bg-white/[0.02] transition-colors cursor-default">
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[13px] text-slate-300">{name}</span>
      </div>
      <div className="text-right flex items-center gap-2">
        <span className="text-[11px] text-slate-500 tabular-nums">{formatCurrency(value, 'ILS')}</span>
        <span className="text-[12px] font-semibold text-slate-200 tabular-nums w-10 text-right">{percent.toFixed(1)}%</span>
      </div>
    </div>
  )
}

export function AllocationChart() {
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

  // Rebuild allocation whenever holdings or the FX rate changes.
  const allocation = buildAllocation(holdings, usdToIls)

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Asset Allocation
          </CardTitle>
          {dataSource === 'mock' && !loading && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-amber-400">Sample</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse">
            <div className="mx-auto mt-2 h-[180px] w-[180px] rounded-full bg-slate-800" />
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                  <div className="h-3 w-28 rounded bg-slate-700" />
                </div>
                <div className="h-3 w-20 rounded bg-slate-700" />
              </div>
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                  <div className="h-3 w-20 rounded bg-slate-700" />
                </div>
                <div className="h-3 w-20 rounded bg-slate-700" />
              </div>
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                  <div className="h-3 w-14 rounded bg-slate-700" />
                </div>
                <div className="h-3 w-20 rounded bg-slate-700" />
              </div>
            </div>
          </div>
        ) : allocation.length === 0 ? (
          <div className="flex items-center justify-center h-[280px]">
            <p className="text-sm text-slate-500 text-center">No holdings yet. Add positions to see allocation.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={allocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {allocation.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-1 space-y-0">
              {allocation.map((item) => (
                <LegendItem
                  key={item.name}
                  name={item.name}
                  value={item.value}
                  color={item.color}
                  percent={item.percent}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
