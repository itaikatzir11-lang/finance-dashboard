'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Line,
  ComposedChart,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import { useChartTheme, type ChartTheme } from '@/hooks/useChartTheme'
import type { HistoryPoint, NetWorthSnapshot } from '@/types'
import { format, subDays, subMonths, subYears } from 'date-fns'
import { History, Camera } from 'lucide-react'

interface BenchmarkPoint { date: string; value: number }

/** Merge portfolio snapshots with benchmark data, both normalised to 100 at start. */
function mergeWithBenchmark(
  portfolioData: HistoryPoint[],
  benchmarkPoints: BenchmarkPoint[]
): Array<{ date: string; portfolio: number; benchmark: number | null }> {
  if (portfolioData.length === 0) return []

  const firstPortfolio = portfolioData[0].value
  const portfolioNorm = portfolioData.map((p) => ({
    date: p.date,
    portfolio: firstPortfolio > 0 ? Math.round((p.value / firstPortfolio) * 10000) / 100 : 100,
  }))

  const benchLookup: Record<string, number> = {}
  for (const b of benchmarkPoints) {
    benchLookup[b.date.slice(0, 10)] = b.value
  }

  return portfolioNorm.map((p) => ({
    date: p.date,
    portfolio: p.portfolio,
    benchmark: benchLookup[p.date.slice(0, 10)] ?? null,
  }))
}

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'

function filterByRange(data: HistoryPoint[], range: TimeRange): HistoryPoint[] {
  const now = new Date()
  let cutoff: Date

  switch (range) {
    case '1W': cutoff = subDays(now, 7); break
    case '1M': cutoff = subMonths(now, 1); break
    case '3M': cutoff = subMonths(now, 3); break
    case '6M': cutoff = subMonths(now, 6); break
    case '1Y': cutoff = subYears(now, 1); break
    case 'ALL': return data
  }

  return data.filter((d) => new Date(d.date) >= cutoff)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  startValue?: number
  ct: ChartTheme
}

function CustomTooltip({ active, payload, label, startValue, ct }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  const change = startValue != null && startValue > 0 ? val - startValue : null
  const changePct = change != null && startValue! > 0 ? (change / startValue!) * 100 : null
  const isPositive = change == null || change >= 0
  return (
    <div
      className="rounded-xl backdrop-blur-md px-4 py-3 shadow-2xl min-w-[160px]"
      style={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}` }}
    >
      <p className="text-[11px] mb-2 font-medium" style={{ color: ct.tooltipLabel }}>
        {label ? format(new Date(label), 'MMM d, yyyy') : ''}
      </p>
      <p className="text-[15px] font-semibold tabular-nums tracking-tight" style={{ color: ct.tooltipText }}>
        {formatCurrency(val, 'ILS')}
      </p>
      {change != null && changePct != null && (
        <p className={`text-[11px] font-medium mt-1 tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '+' : ''}{formatCurrency(change, 'ILS')} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
        </p>
      )}
    </div>
  )
}

const RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL']

export function PortfolioHistoryChart() {
  const [allData, setAllData] = useState<HistoryPoint[]>([])
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([])
  const [showBenchmark, setShowBenchmark] = useState(false)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<TimeRange>('6M')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const { usdToIls } = useFxRate()
  const ct = useChartTheme()

  const loadSnapshots = useCallback(() => {
    fetch('/api/snapshots')
      .then(async (r) => {
        if (!r.ok) return
        const snapshots: NetWorthSnapshot[] = await r.json()
        if (Array.isArray(snapshots) && snapshots.length > 0) {
          setAllData(snapshots.map((s) => ({ date: s.createdAt, value: s.totalValue })))
        } else {
          setAllData([])
        }
      })
      .catch(() => { setAllData([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  // Lazily load benchmark when first toggled on
  useEffect(() => {
    if (!showBenchmark || benchmark.length > 0) return
    fetch(`/api/benchmark?range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.points)) setBenchmark(d.points) })
      .catch(() => {})
  }, [showBenchmark, range, benchmark.length])

  // Reload benchmark when range changes (if currently shown)
  useEffect(() => {
    if (!showBenchmark) return
    setBenchmark([])
    fetch(`/api/benchmark?range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.points)) setBenchmark(d.points) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  async function handleSaveSnapshot() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/snapshots', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSaveMsg({ text: `Snapshot saved — ${formatCurrency(data.totalValue * usdToIls, 'ILS')}`, ok: true })
        loadSnapshots()
      } else {
        setSaveMsg({ text: data.error ?? 'Failed to save snapshot', ok: false })
      }
    } catch {
      setSaveMsg({ text: 'Network error', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  // Raw USD data filtered by time range
  const filtered = filterByRange(allData, range)

  // ILS-converted data for the standard chart
  const filteredIls: HistoryPoint[] = filtered.map((d) => ({ date: d.date, value: d.value * usdToIls }))

  const mergedData = showBenchmark ? mergeWithBenchmark(filtered, benchmark) : null

  const endValueIls = filteredIls[filteredIls.length - 1]?.value ?? 0
  const startValueIls = filteredIls[0]?.value ?? 0
  const totalChangeIls = endValueIls - startValueIls
  const totalChangePercent = startValueIls > 0 ? (totalChangeIls / startValueIls) * 100 : 0

  // Y axis bounds for ILS chart
  const minValueIls = filteredIls.length > 0 ? Math.min(...filteredIls.map((d) => d.value)) : 0
  const maxValueIls = filteredIls.length > 0 ? Math.max(...filteredIls.map((d) => d.value)) : 0
  const paddingIls = (maxValueIls - minValueIls) * 0.1
  const yMin = Math.floor((minValueIls - paddingIls) / 10000) * 10000
  const yMax = Math.ceil((maxValueIls + paddingIls) / 10000) * 10000

  const tickCount = Math.min(filteredIls.length, range === '1W' ? 7 : range === '1M' ? 6 : 5)
  const tickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / (tickCount - 1)) * (filteredIls.length - 1))
  )
  const ticks = tickIndices.map((i) => filteredIls[i]?.date).filter(Boolean)

  const dateFormat = range === '1W'
    ? 'EEE'
    : range === '1M'
    ? 'MMM d'
    : range === '3M' || range === '6M'
    ? 'MMM d'
    : 'MMM yy'

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Portfolio History
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-slate-100">{formatCurrency(endValueIls, 'ILS')}</span>
              {allData.length > 0 && (
                <span className={`text-xs font-medium ${totalChangeIls >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalChangeIls >= 0 ? '+' : ''}{formatCurrency(totalChangeIls, 'ILS')}
                  {' '}({totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Benchmark toggle */}
            {allData.length > 0 && (
              <button
                onClick={() => setShowBenchmark((v) => !v)}
                className={`h-7 px-2.5 rounded-md text-xs border transition-colors ${
                  showBenchmark
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                vs S&amp;P 500
              </button>
            )}

            {/* Save snapshot button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveSnapshot}
              loading={saving}
              className="h-7 px-2.5 text-xs gap-1.5 text-slate-400 border-slate-700 hover:text-slate-200"
              title="Save current net worth as a data point"
            >
              <Camera className="h-3 w-3" />
              Save
            </Button>

            {/* Time range selector */}
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <Button
                  key={r}
                  variant={range === r ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRange(r)}
                  className="h-7 px-2 text-xs min-w-[36px]"
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Save feedback */}
        {saveMsg && (
          <p className={`text-xs mt-1 ${saveMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {saveMsg.text}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {!loading && allData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[280px] gap-4 text-center">
            <History className="h-10 w-10 text-slate-700" />
            <div>
              <p className="text-sm text-slate-400 font-medium mb-1">No portfolio history yet</p>
              <p className="text-xs text-slate-600 max-w-xs">
                Click <span className="text-slate-400 font-medium">Save</span> above to record today&apos;s net worth as the first data point. Do this regularly to build your history.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveSnapshot}
              loading={saving}
              className="gap-2"
            >
              <Camera className="h-3.5 w-3.5" />
              Save First Snapshot
            </Button>
          </div>
        ) : showBenchmark && mergedData ? (
        /* ── Benchmark comparison mode (% normalised) ── */
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={mergedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={(v) => { try { return format(new Date(v), dateFormat) } catch { return v } }}
              tick={{ fill: ct.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fill: ct.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div
                    className="rounded-xl backdrop-blur-md px-4 py-3 shadow-2xl text-xs space-y-1.5 min-w-[160px]"
                    style={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}` }}
                  >
                    <p className="font-medium mb-2" style={{ color: ct.tooltipLabel }}>
                      {label ? format(new Date(label), 'MMM d, yyyy') : ''}
                    </p>
                    {payload.map((p) => (
                      <div key={p.name} className="flex items-center justify-between gap-6">
                        <span style={{ color: p.color as string }} className="font-medium">{p.name}</span>
                        <span className="font-semibold tabular-nums" style={{ color: ct.tooltipText }}>
                          {p.value != null ? `${(p.value as number).toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px', color: ct.axis }} />
            <Area
              type="monotone"
              dataKey="portfolio"
              name="My Portfolio"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#portfolioGradient2)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1', stroke: ct.dotStroke, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              name="S&P 500 (SPY)"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        ) : (
        /* ── Standard ILS chart ── */
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredIls} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={(v) => format(new Date(v), dateFormat)}
              tick={{ fill: ct.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => `₪${formatNumber(v)}`}
              tick={{ fill: ct.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip content={<CustomTooltip startValue={startValueIls} ct={ct} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#portfolioGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1', stroke: ct.dotStroke, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
