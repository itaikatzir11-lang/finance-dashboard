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
import { formatCurrency } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import { useChartTheme } from '@/hooks/useChartTheme'
import type { NetWorthSummary, AllocationData } from '@/types'

const SLICE_DEFS: Array<{ key: keyof NetWorthSummary['breakdown']; label: string; color: string }> = [
  { key: 'capitalMarket', label: 'Capital Market', color: '#6366f1' },
  { key: 'cash',          label: 'Cash',           color: '#10b981' },
  { key: 'crypto',        label: 'Crypto',         color: '#f59e0b' },
  { key: 'pension',       label: 'Pension',        color: '#8b5cf6' },
]

function buildAllocation(breakdown: NetWorthSummary['breakdown'], usdToIls: number): AllocationData[] {
  const entries = SLICE_DEFS.map(({ key, label, color }) => ({
    name:    label,
    value:   (breakdown[key] ?? 0) * usdToIls,
    color,
    percent: 0,
  })).filter((e) => e.value > 0)

  const total = entries.reduce((s, e) => s + e.value, 0)
  return entries.map((e) => ({ ...e, percent: total > 0 ? (e.value / total) * 100 : 0 }))
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
  const [data, setData] = useState<NetWorthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const { usdToIls } = useFxRate()

  useEffect(() => {
    fetch('/api/net-worth')
      .then((r) => r.json())
      .then((res: NetWorthSummary) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const allocation = data ? buildAllocation(data.breakdown, usdToIls) : []
  const isMock = data?.dataSource === 'mock'

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Asset Allocation
          </CardTitle>
          {isMock && !loading && (
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
              {[28, 20, 14].map((w) => (
                <div key={w} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                    <div className={`h-3 w-${w} rounded bg-slate-700`} />
                  </div>
                  <div className="h-3 w-20 rounded bg-slate-700" />
                </div>
              ))}
            </div>
          </div>
        ) : allocation.length === 0 ? (
          <div className="flex items-center justify-center h-[280px]">
            <p className="text-sm text-slate-500 text-center">No data yet. Sync accounts to see allocation.</p>
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
