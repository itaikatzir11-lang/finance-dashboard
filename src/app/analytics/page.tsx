'use client'

import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { format, subDays, subMonths } from 'date-fns'
import { FlaskConical, Database } from 'lucide-react'
import type { HoldingWithAccount, HoldingsResponse, Transaction } from '@/types'
import { useChartTheme, type ChartTheme } from '@/hooks/useChartTheme'
import { useTheme } from '@/contexts/ThemeContext'

// ── Types ────────────────────────────────────────────────────────────────────

type Range = '1M' | '3M' | '6M' | '1Y'

interface HistoryPoint   { date: string; portfolio: number }
interface MonthlyPnL     { month: string; pnl: number; isPositive: boolean }
interface AllocationPoint { date: string; Cash: number; CapitalMarkets: number; Crypto: number; Pension: number }
interface MonthlyCashFlow { month: string; income: number; expenses: number }
interface TopHolding      { name: string; value: number; color: string }
interface BenchmarkPoint  { date: string; value: number }

interface AnalyticsData {
  hasData: boolean
  snapshotCount: number
  history?: HistoryPoint[]
  monthlyPnL?: MonthlyPnL[]
  allocationHistory?: AllocationPoint[]
  kpis?: {
    totalReturn: number
    cagr: number
    sharpe: number
    maxDrawdown: number
    bestMonth: { month: string; pnl: number } | null
    worstMonth: { month: string; pnl: number } | null
    avgMonthlyPnL: number
    startVal: number
    endVal: number
    daysElapsed: number
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#06b6d4', '#a855f7', '#84cc16', '#fb923c']

function generatePortfolioHistory(): HistoryPoint[] {
  const days = 365
  const startValue = 210000
  const endValue   = 310000
  return Array.from({ length: days + 1 }, (_, i) => {
    const progress = i / days
    const trend    = startValue + (endValue - startValue) * progress
    const vol      = trend * 0.02 * Math.sin(i * 0.25 + 0.5)
    const noise    = trend * 0.008 * (Math.sin(i * 1.3) + Math.cos(i * 0.7))
    return {
      date: subDays(new Date(), days - i).toISOString(),
      portfolio: Math.max(trend + vol + noise, startValue * 0.85),
    }
  })
}

function generateAllocationHistory(): AllocationPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month    = subMonths(new Date(), 11 - i)
    const progress = i / 11
    const total    = 210000 + 100000 * progress
    return {
      date: format(month, 'MMM yy'),
      Cash:           total * (0.18 - 0.08 * progress),
      CapitalMarkets: total * (0.40 + 0.08 * progress),
      Crypto:         total * (0.22 + 0.02 * progress),
      Pension:        total * (0.20 - 0.02 * progress),
    }
  })
}

function generateMonthlyPnL(): MonthlyPnL[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = subMonths(new Date(), 11 - i)
    const base  = 2000 + 5000 * ((11 - i) / 11)
    const noise = Math.sin(i * 0.8) * 3000
    const pnl   = base + noise
    return { month: format(month, 'MMM yy'), pnl: Math.round(pnl), isPositive: pnl >= 0 }
  })
}

function generateDemoCashFlow(): MonthlyCashFlow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = subMonths(new Date(), 11 - i)
    return {
      month:    format(month, 'MMM yy'),
      income:   5000 + Math.sin(i * 0.7) * 1200,
      expenses: 3200 + Math.cos(i * 0.5) * 800,
    }
  })
}

function generateDemoTopHoldings(): TopHolding[] {
  return [
    { name: 'VOO', value: 82000 },
    { name: 'AAPL', value: 47000 },
    { name: 'BTC', value: 41000 },
    { name: 'QQQ', value: 31000 },
    { name: 'ETH', value: 18000 },
    { name: 'Other', value: 21000 },
  ].map((h, i) => ({ ...h, color: PIE_COLORS[i] }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANGE_DAYS: Record<Range, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }

/** Find the SPY normalised value closest to a given ISO date string */
function closestBenchmark(date: string, points: BenchmarkPoint[]): number | undefined {
  if (points.length === 0) return undefined
  const t = new Date(date).getTime()
  let best = points[0]
  let bestDiff = Math.abs(new Date(best.date).getTime() - t)
  for (const p of points) {
    const diff = Math.abs(new Date(p.date).getTime() - t)
    if (diff < bestDiff) { best = p; bestDiff = diff }
  }
  return best.value
}

// ── Tooltip components ────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function useTooltipBox(ct: ChartTheme) {
  return {
    style: { background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}` } as React.CSSProperties,
    labelColor: ct.tooltipLabel,
    textColor:  ct.tooltipText,
  }
}

function HistoryTooltip({ active, payload, label, ct }: TooltipProps & { ct: ChartTheme }) {
  const box = useTooltipBox(ct)
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl backdrop-blur-md px-4 py-3 text-xs space-y-1.5 min-w-[160px] shadow-2xl" style={box.style}>
      <p className="font-medium mb-2" style={{ color: box.labelColor }}>
        {label ? format(new Date(label), 'MMM d, yyyy') : ''}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-semibold tabular-nums" style={{ color: box.textColor }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function AllocationTooltip({ active, payload, label, ct }: TooltipProps & { ct: ChartTheme }) {
  const box = useTooltipBox(ct)
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="rounded-xl backdrop-blur-md px-4 py-3 text-xs space-y-1.5 min-w-[180px] shadow-2xl" style={box.style}>
      <p className="font-medium mb-2" style={{ color: box.labelColor }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-semibold tabular-nums" style={{ color: box.textColor }}>
            {formatCurrency(p.value)} ({total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%)
          </span>
        </div>
      ))}
    </div>
  )
}

function CashFlowTooltip({ active, payload, label, ct }: TooltipProps & { ct: ChartTheme }) {
  const box = useTooltipBox(ct)
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl backdrop-blur-md px-4 py-3 text-xs space-y-1.5 min-w-[140px] shadow-2xl" style={box.style}>
      <p className="font-medium mb-2" style={{ color: box.labelColor }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-semibold tabular-nums" style={{ color: box.textColor }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload, ct }: TooltipProps & { ct: ChartTheme }) {
  const box = useTooltipBox(ct)
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-xl backdrop-blur-md px-4 py-3 text-xs min-w-[120px] shadow-2xl" style={box.style}>
      <p style={{ color: p.color }} className="font-semibold mb-1">{p.name}</p>
      <p className="font-semibold tabular-nums" style={{ color: box.textColor }}>{formatCurrency(p.value)}</p>
    </div>
  )
}

function PnLTooltip({ active, payload, label, ct }: TooltipProps & { ct: ChartTheme }) {
  const box = useTooltipBox(ct)
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-xl backdrop-blur-md px-4 py-3 text-xs min-w-[120px] shadow-2xl" style={box.style}>
      <p className="font-medium mb-1.5" style={{ color: box.labelColor }}>{label}</p>
      <p className={`font-semibold tabular-nums ${val >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {val >= 0 ? '+' : ''}{formatCurrency(val)}
      </p>
    </div>
  )
}

// ── Stats Card ────────────────────────────────────────────────────────────────

interface StatsCardProps {
  label: string
  value: string
  sub?: string
  color?: string
}

function StatsCard({ label, value, sub, color }: StatsCardProps) {
  return (
    <Card className="hover:-translate-y-0.5 transition-all duration-200 cursor-default">
      <CardContent className="p-5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums tracking-tighter ${color ?? 'text-slate-100'}`}>{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── Range selector ────────────────────────────────────────────────────────────

const RANGES: Range[] = ['1M', '3M', '6M', '1Y']

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { theme } = useTheme()
  const isDark = theme !== 'light'
  return (
    <div
      className="flex gap-1 rounded-lg p-0.5"
      style={{ background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(0,0,0,0.06)' }}
    >
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 ${
            value === r
              ? 'bg-indigo-600 text-white shadow-sm'
              : isDark
              ? 'text-slate-500 hover:text-slate-200 hover:bg-slate-700/60'
              : 'text-slate-500 hover:text-slate-700 hover:bg-black/10'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const ct = useChartTheme()
  const [analyticsData, setAnalyticsData]   = useState<AnalyticsData | null>(null)
  const [transactions, setTransactions]     = useState<Transaction[]>([])
  const [holdings, setHoldings]             = useState<HoldingWithAccount[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedRange, setSelectedRange]   = useState<Range>('1Y')
  const [benchmarkPoints, setBenchmarkPoints] = useState<BenchmarkPoint[]>([])

  // Fetch analytics + transactions + holdings on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/analytics').then((r) => r.json()).catch(() => ({ hasData: false, snapshotCount: 0 })),
      fetch('/api/transactions?limit=500').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/holdings').then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([analytics, txRes, holdingsRes]) => {
      setAnalyticsData(analytics as AnalyticsData)
      setTransactions(Array.isArray(txRes.data) ? txRes.data : [])
      setHoldings(Array.isArray(holdingsRes.data) ? holdingsRes.data : [])
    }).finally(() => setLoading(false))
  }, [])

  // Fetch SPY benchmark whenever range changes
  useEffect(() => {
    fetch(`/api/benchmark?range=${selectedRange}`)
      .then((r) => r.json())
      .then((data) => setBenchmarkPoints(Array.isArray(data.points) ? data.points : []))
      .catch(() => {})
  }, [selectedRange])

  // Demo fallback data
  const demoHistory     = useMemo(() => generatePortfolioHistory(), [])
  const demoAllocation  = useMemo(() => generateAllocationHistory(), [])
  const demoPnL         = useMemo(() => generateMonthlyPnL(), [])

  const isReal         = !!(analyticsData?.hasData)
  const hasTransactions = transactions.length > 0

  const history           = isReal ? (analyticsData!.history          ?? []) : demoHistory
  const allocationHistory = isReal ? (analyticsData!.allocationHistory ?? []) : demoAllocation
  const monthlyPnL        = isReal ? (analyticsData!.monthlyPnL        ?? []) : demoPnL

  // ── Filter history by selected range ────────────────────────────────────
  const filteredHistory = useMemo(() => {
    const cutoffMs = RANGE_DAYS[selectedRange] * 24 * 60 * 60 * 1000
    const now      = Date.now()
    const filtered = history.filter((pt) => now - new Date(pt.date).getTime() <= cutoffMs)
    return filtered.length > 0 ? filtered : history
  }, [history, selectedRange])

  // ── Merge portfolio history with scaled SPY benchmark ───────────────────
  const chartData = useMemo(() => {
    if (filteredHistory.length === 0) return []
    const startVal = filteredHistory[0].portfolio
    return filteredHistory.map((pt) => {
      const spyNorm = closestBenchmark(pt.date, benchmarkPoints)
      // Scale SPY so it starts at the same dollar value as the portfolio
      const spy = spyNorm !== undefined && startVal > 0
        ? Math.round(startVal * spyNorm / 100)
        : undefined
      return { date: pt.date, portfolio: pt.portfolio, spy }
    })
  }, [filteredHistory, benchmarkPoints])

  // ── Monthly cash flow from real transactions ────────────────────────────
  const monthlyCashFlow = useMemo((): MonthlyCashFlow[] => {
    if (!hasTransactions) return generateDemoCashFlow()
    const map: Record<string, MonthlyCashFlow> = {}
    for (const tx of transactions) {
      const key   = format(new Date(tx.date), 'yyyy-MM')
      const label = format(new Date(tx.date), 'MMM yy')
      if (!map[key]) map[key] = { month: label, income: 0, expenses: 0 }
      const abs = Math.abs(tx.amount)
      if (tx.type === 'DEPOSIT' || tx.type === 'DIVIDEND') {
        map[key].income += abs
      } else if (tx.type === 'WITHDRAWAL' || tx.type === 'FEE') {
        map[key].expenses += abs
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-12)
  }, [transactions, hasTransactions])

  // ── Top holdings pie chart ──────────────────────────────────────────────
  const topHoldings = useMemo((): TopHolding[] => {
    const source = holdings.filter((h) => h.currentValue > 0)
    if (source.length === 0) return generateDemoTopHoldings()
    const sorted = [...source].sort((a, b) => b.currentValue - a.currentValue)
    const top7   = sorted.slice(0, 7)
    const rest   = sorted.slice(7)
    const other  = rest.reduce((s, h) => s + h.currentValue, 0)
    const result: TopHolding[] = top7.map((h, i) => ({ name: h.symbol, value: h.currentValue, color: PIE_COLORS[i] }))
    if (other > 0) result.push({ name: 'Other', value: other, color: PIE_COLORS[7] })
    return result
  }, [holdings])

  // ── KPIs ────────────────────────────────────────────────────────────────
  let totalReturn: number, cagr: number, sharpe: number, maxDrawdown: number
  let bestMonth: { month: string; pnl: number } | null
  let worstMonth: { month: string; pnl: number } | null
  let avgMonthlyPnL: number

  if (isReal && analyticsData!.kpis) {
    const k  = analyticsData!.kpis
    totalReturn  = k.totalReturn
    cagr         = k.cagr
    sharpe       = k.sharpe
    maxDrawdown  = k.maxDrawdown
    bestMonth    = k.bestMonth
    worstMonth   = k.worstMonth
    avgMonthlyPnL = k.avgMonthlyPnL
  } else {
    const startVal = demoHistory[0].portfolio
    const endVal   = demoHistory[demoHistory.length - 1].portfolio
    totalReturn    = ((endVal - startVal) / startVal) * 100
    cagr           = totalReturn
    const returns  = demoPnL.map((m) => m.pnl / 250000)
    const avg      = returns.reduce((s, r) => s + r, 0) / returns.length
    const std      = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / returns.length)
    sharpe         = std > 0 ? (avg * 12) / (std * Math.sqrt(12)) : 0
    maxDrawdown    = -8.3
    bestMonth      = demoPnL.reduce((b, m) => m.pnl > b.pnl ? m : b)
    worstMonth     = demoPnL.reduce((w, m) => m.pnl < w.pnl ? m : w)
    avgMonthlyPnL  = avg * 250000
  }

  // X-axis tick reduction for dense datasets
  const chartTicks = chartData.length > 4
    ? [0, Math.floor(chartData.length / 4), Math.floor(chartData.length / 2),
        Math.floor((3 * chartData.length) / 4), chartData.length - 1]
        .map((i) => chartData[i]?.date)
    : chartData.map((h) => h.date)

  const hasSpy = chartData.some((pt) => pt.spy !== undefined)

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Analytics" />

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 space-y-6">

        {/* ── Data source banner ──────────────────────────────────────────── */}
        {loading ? (
          <div className="h-12 rounded-xl bg-slate-800 animate-pulse" />
        ) : isReal ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <Database className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Live portfolio data</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All charts and KPIs computed from {analyticsData!.snapshotCount} real portfolio
                snapshots{hasTransactions ? ` and ${transactions.length} transactions` : ''}.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <FlaskConical className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">
                Demo data — analytics not yet connected to real portfolio history
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {analyticsData?.snapshotCount === 1
                  ? 'Only 1 snapshot found — need at least 2 to compute real analytics. Sync again tomorrow.'
                  : 'Real analytics will populate once portfolio snapshots exist. Click "Sync Now" on the Accounts page.'}
              </p>
            </div>
          </div>
        )}

        {/* ── KPI stats ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="Total Return"
            value={formatPercent(totalReturn)}
            sub={isReal ? `over ${Math.round(analyticsData?.kpis?.daysElapsed ?? 365)} days` : 'from 1 year ago'}
            color={totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}
          />
          <StatsCard
            label="CAGR"
            value={`${cagr.toFixed(1)}%`}
            sub="compound annual growth"
            color="text-indigo-400"
          />
          <StatsCard
            label="Sharpe Ratio"
            value={sharpe.toFixed(2)}
            sub="risk-adjusted return"
            color={sharpe > 1 ? 'text-emerald-400' : 'text-amber-400'}
          />
          <StatsCard
            label="Best Month"
            value={bestMonth ? `+${formatCurrency(bestMonth.pnl)}` : '—'}
            sub={bestMonth?.month}
            color="text-emerald-400"
          />
        </div>

        {/* ── Portfolio history + SPY benchmark ────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Portfolio Value vs S&P 500
                {!isReal && <span className="ml-2 text-amber-500/60 normal-case font-normal">(demo)</span>}
              </CardTitle>
              <RangeSelector value={selectedRange} onChange={setSelectedRange} />
            </div>
            {hasSpy && (
              <p className="text-[11px] text-slate-500 mt-1">
                SPY scaled to match portfolio starting value — both lines show dollar performance from the same baseline.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPort" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={chartTicks}
                  tickFormatter={(v) => { try { return format(new Date(v), 'MMM yy') } catch { return v } }}
                  tick={{ fill: ct.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: ct.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<HistoryTooltip ct={ct} />} />
                {hasSpy && (
                  <Legend
                    wrapperStyle={{ paddingTop: '10px', fontSize: '11px', color: ct.axis }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  name="My Portfolio"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#gradPort)"
                  dot={false}
                  connectNulls
                />
                {hasSpy && (
                  <Area
                    type="monotone"
                    dataKey="spy"
                    name="SPY (S&P 500)"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    fill="none"
                    dot={false}
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Monthly P&L bar chart ────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Monthly P&L
              {!isReal && <span className="ml-2 text-amber-500/60 normal-case font-normal">(demo)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyPnL} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: ct.axis, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: ct.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<PnLTooltip ct={ct} />} />
                <Bar dataKey="pnl" name="Monthly P&L" radius={[3, 3, 0, 0]}>
                  {monthlyPnL.map((entry, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={entry.isPositive ? '#10b981' : '#f43f5e'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Monthly Cash Flow + Top Holdings ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Monthly Cash Flow
                {!hasTransactions && <span className="ml-2 text-amber-500/60 normal-case font-normal">(demo)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyCashFlow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: ct.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={50}
                  />
                  <Tooltip content={<CashFlowTooltip ct={ct} />} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px', color: ct.axis }} />
                  <Bar dataKey="income"   name="Income"   fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Top Holdings by Value
                {holdings.length === 0 && <span className="ml-2 text-amber-500/60 normal-case font-normal">(demo)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={topHoldings}
                      dataKey="value"
                      nameKey="name"
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={90}
                      strokeWidth={0}
                    >
                      {topHoldings.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip ct={ct} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {topHoldings.map((h) => {
                    const total = topHoldings.reduce((s, x) => s + x.value, 0)
                    const pct   = total > 0 ? (h.value / total) * 100 : 0
                    return (
                      <div key={h.name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: h.color }} />
                        <span className="text-slate-300 font-medium truncate">{h.name}</span>
                        <span className="text-slate-500 ml-auto">{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Asset allocation over time ───────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Asset Allocation Over Time
              {!isReal && <span className="ml-2 text-amber-500/60 normal-case font-normal">(demo)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={allocationHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                />
                <Tooltip content={<AllocationTooltip ct={ct} />} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px', color: ct.axis }} />
                <Area type="monotone" dataKey="CapitalMarkets" name="Capital Markets" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                <Area type="monotone" dataKey="Pension"        name="Pension"         stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                <Area type="monotone" dataKey="Crypto"         name="Crypto"          stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                <Area type="monotone" dataKey="Cash"           name="Cash"            stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Bottom stats row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="Worst Month"
            value={worstMonth ? formatCurrency(worstMonth.pnl) : '—'}
            sub={worstMonth?.month}
            color="text-rose-400"
          />
          <StatsCard
            label="Avg Monthly P&L"
            value={formatCurrency(avgMonthlyPnL)}
            sub={isReal ? `over ${monthlyPnL.length} months` : 'over past 12 months'}
            color={avgMonthlyPnL > 0 ? 'text-emerald-400' : 'text-rose-400'}
          />
          <StatsCard
            label="Max Drawdown"
            value={`${maxDrawdown.toFixed(1)}%`}
            sub="worst peak-to-trough"
            color="text-rose-400"
          />
          <StatsCard
            label="Portfolio Size"
            value={isReal && analyticsData?.kpis ? formatCurrency(analyticsData.kpis.endVal) : '—'}
            sub={isReal ? 'current value' : 'connect DB to see'}
            color="text-slate-100"
          />
        </div>

      </main>
    </div>
  )
}
