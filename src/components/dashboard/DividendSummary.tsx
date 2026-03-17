'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface SymbolRow { symbol: string; total: number }
interface MonthPoint { month: string; total: number }
interface DividendData {
  totalIncome: number
  symbolBreakdown: SymbolRow[]
  monthlyChart: MonthPoint[]
  count: number
  availableYears: number[]
  dataSource: 'db' | 'mock'
}

function PnLTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-emerald-400">+{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export function DividendSummary() {
  const [data, setData] = useState<DividendData | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  useEffect(() => {
    const url = selectedYear != null ? `/api/dividends?year=${selectedYear}` : '/api/dividends'
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [selectedYear])

  if (!data) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="h-32 animate-pulse bg-slate-800 rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  if (data.count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Dividend Income
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No dividend transactions recorded yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Dividend Income
          </CardTitle>
          <div className="flex items-center gap-3">
            {data.availableYears.length > 0 && (
              <select
                value={selectedYear ?? ''}
                onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">All time</option>
                {data.availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            <span className="text-xl font-bold text-emerald-400 tabular-nums">
              +{formatCurrency(data.totalIncome)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Per-symbol breakdown */}
        <div className="space-y-2">
          {data.symbolBreakdown.map((row) => (
            <div key={row.symbol} className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">{row.symbol}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(row.total / data.totalIncome) * 100}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums text-emerald-400 font-medium w-20 text-right">
                  +{formatCurrency(row.total)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Monthly bar chart */}
        {data.monthlyChart.length > 1 && (
          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Monthly</p>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={data.monthlyChart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<PnLTooltip />} />
                <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                  {data.monthlyChart.map((_, i) => (
                    <Cell key={i} fill="#10b981" fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-xs text-slate-500">{data.count} dividend payment{data.count !== 1 ? 's' : ''} recorded</p>
      </CardContent>
    </Card>
  )
}
