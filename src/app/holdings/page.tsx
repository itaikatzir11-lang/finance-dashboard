'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { HoldingsTable } from '@/components/holdings/HoldingsTable'
import { ForecastsTab } from '@/components/holdings/ForecastsTab'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { HoldingWithAccount, AssetClass, HoldingsResponse, AccountsResponse, AccountWithStats } from '@/types'
import { TrendingUp, TrendingDown, Download, Plus } from 'lucide-react'

type FilterClass = 'ALL' | AssetClass

// ── Add Holding Modal ─────────────────────────────────────────────────────────

const ASSET_CLASSES: AssetClass[] = ['STOCK', 'ETF', 'CRYPTO', 'CASH', 'BOND', 'OTHER']

interface AddHoldingModalProps {
  onClose: () => void
  onSaved: () => void
}

function AddHoldingModal({ onClose, onSaved }: AddHoldingModalProps) {
  const [accounts, setAccounts] = useState<AccountWithStats[]>([])
  const [accountId, setAccountId] = useState('')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState<AssetClass>('STOCK')
  const [quantity, setQuantity] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [avgCostBasis, setAvgCostBasis] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priceLookup, setPriceLookup] = useState<{ loading: boolean; source: string | null }>({ loading: false, source: null })

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((res: AccountsResponse) => {
        const list = Array.isArray(res.data) ? res.data : []
        setAccounts(list)
        if (list.length > 0) setAccountId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const previewValue = parseFloat(quantity) * parseFloat(currentPrice)

  async function handleSymbolBlur() {
    if (!symbol.trim()) return
    setPriceLookup({ loading: true, source: null })
    try {
      const res = await fetch(`/api/holdings/price?symbol=${encodeURIComponent(symbol)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.price > 0) {
          setCurrentPrice(String(data.price))
          setPriceLookup({ loading: false, source: data.source })
        } else {
          setPriceLookup({ loading: false, source: null })
        }
      } else {
        setPriceLookup({ loading: false, source: null })
      }
    } catch {
      setPriceLookup({ loading: false, source: null })
    }
  }

  async function handleSave() {
    const qty = parseFloat(quantity)
    const price = parseFloat(currentPrice)
    if (!accountId) { setError('Select an account'); return }
    if (!symbol.trim()) { setError('Symbol is required'); return }
    if (!name.trim()) { setError('Name is required'); return }
    if (!Number.isFinite(qty) || qty < 0) { setError('Enter a valid quantity'); return }
    if (!Number.isFinite(price) || price < 0) { setError('Enter a valid price'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          symbol: symbol.toUpperCase(),
          name,
          assetClass,
          quantity: qty,
          currentPrice: price,
          avgCostBasis: avgCostBasis !== '' ? parseFloat(avgCostBasis) : null,
          currency: selectedAccount?.currency ?? 'USD',
        }),
      })
      if (res.ok) {
        onSaved()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Add Holding</h2>

        <div className="grid grid-cols-2 gap-3">
          {/* Account */}
          <div className="col-span-2">
            <label className={labelCls}>Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </select>
          </div>

          {/* Symbol */}
          <div>
            <label className={labelCls}>Symbol</label>
            <input
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setPriceLookup({ loading: false, source: null }) }}
              onBlur={handleSymbolBlur}
              placeholder="e.g. AAPL"
              className={inputCls}
            />
          </div>

          {/* Asset class */}
          <div>
            <label className={labelCls}>Asset Class</label>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} className={inputCls}>
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="col-span-2">
            <label className={labelCls}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
              className={inputCls}
            />
          </div>

          {/* Quantity */}
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              type="number" min="0" step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              className={inputCls}
            />
          </div>

          {/* Current price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls} style={{ margin: 0 }}>Current Price</label>
              {priceLookup.loading && (
                <span className="text-[10px] text-slate-500">Looking up…</span>
              )}
              {!priceLookup.loading && priceLookup.source && priceLookup.source !== 'mock' && (
                <span className="text-[10px] text-emerald-500 font-medium">● live price</span>
              )}
              {!priceLookup.loading && priceLookup.source === 'mock' && (
                <span className="text-[10px] text-amber-500 font-medium">● estimated</span>
              )}
            </div>
            <input
              type="number" min="0" step="any"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              placeholder="e.g. 189.30"
              className={inputCls}
            />
          </div>

          {/* Avg cost basis */}
          <div className="col-span-2">
            <label className={labelCls}>Avg Cost Basis <span className="text-slate-600">(optional)</span></label>
            <input
              type="number" min="0" step="any"
              value={avgCostBasis}
              onChange={(e) => setAvgCostBasis(e.target.value)}
              placeholder="e.g. 150.00"
              className={inputCls}
            />
          </div>

          {/* Value preview */}
          {Number.isFinite(previewValue) && previewValue > 0 && (
            <div className="col-span-2 rounded-lg bg-slate-800/60 px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-500">{quantity} × {formatCurrency(parseFloat(currentPrice))}</span>
              <span className="text-sm font-semibold font-mono text-slate-200">{formatCurrency(previewValue)}</span>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <Button onClick={handleSave} loading={saving} className="flex-1">Add Holding</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

const FILTERS: { label: string; value: FilterClass }[] = [
  { label: 'All',    value: 'ALL' },
  { label: 'Stocks', value: 'STOCK' },
  { label: 'ETFs',   value: 'ETF' },
  { label: 'Crypto', value: 'CRYPTO' },
  { label: 'Cash',   value: 'CASH' },
  { label: 'Bonds',  value: 'BOND' },
]

interface StatCardProps {
  label: string
  value: string
  subValue?: string
  color?: string
}

function StatCard({ label, value, subValue, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 hover:-translate-y-0.5 transition-all duration-200 cursor-default">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums tracking-tighter ${color ?? 'text-slate-100'}`}>{value}</p>
      {subValue && <p className={`text-[11px] mt-1.5 ${color ?? 'text-slate-500'}`}>{subValue}</p>}
    </div>
  )
}

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [filter, setFilter] = useState<FilterClass>('ALL')
  const [showAddModal, setShowAddModal] = useState(false)
  const [tableKey, setTableKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'holdings' | 'forecasts'>('holdings')
  const { usdToIls } = useFxRate()

  const fetchHoldings = useCallback(() => {
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((res: HoldingsResponse) => setHoldings(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchHoldings() }, [fetchHoldings])

  // Compute stats — all values converted to ILS for display
  const totalValue = holdings.reduce((sum, h) => {
    const ils = h.currency === 'ILS' ? h.currentValue : h.currentValue * usdToIls
    return sum + ils
  }, 0)

  const positions = holdings.filter((h) => h.assetClass !== 'CASH').length

  const sortedByChange = [...holdings].filter((h) => h.assetClass !== 'CASH').sort(
    (a, b) => b.dailyChangePercent - a.dailyChangePercent
  )
  const bestPerformer = sortedByChange[0]
  const worstPerformer = sortedByChange[sortedByChange.length - 1]

  const avgDailyChange = holdings
    .filter((h) => h.assetClass !== 'CASH')
    .reduce((sum, h) => sum + h.dailyChangePercent, 0) /
    Math.max(holdings.filter((h) => h.assetClass !== 'CASH').length, 1)

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Holdings" />

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Value"
            value={formatCurrency(totalValue, 'ILS')}
          />
          <StatCard
            label="Open Positions"
            value={String(positions)}
            subValue="active securities"
          />
          {bestPerformer && (
            <StatCard
              label="Best Today"
              value={bestPerformer.symbol}
              subValue={formatPercent(bestPerformer.dailyChangePercent)}
              color="text-emerald-400"
            />
          )}
          {worstPerformer && (
            <StatCard
              label="Worst Today"
              value={worstPerformer.symbol}
              subValue={formatPercent(worstPerformer.dailyChangePercent)}
              color="text-rose-400"
            />
          )}
        </div>

        {/* Daily change summary bar */}
        <div className={`rounded-xl border p-4 flex items-center justify-between ${
          avgDailyChange >= 0
            ? 'border-emerald-800/40 bg-emerald-900/10'
            : 'border-rose-800/40 bg-rose-900/10'
        }`}>
          <div className="flex items-center gap-3">
            {avgDailyChange >= 0
              ? <TrendingUp className="h-5 w-5 text-emerald-400" />
              : <TrendingDown className="h-5 w-5 text-rose-400" />
            }
            <div>
              <p className="text-sm font-medium text-slate-200">
                Portfolio is{' '}
                <span className={getChangeColor(avgDailyChange)}>
                  {avgDailyChange >= 0 ? 'up' : 'down'} {formatPercent(Math.abs(avgDailyChange))}
                </span>
                {' '}on average today
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Across {positions} active positions
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 border-b border-slate-800">
          {(['holdings', 'forecasts'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-slate-100 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              {tab === 'holdings' ? 'Holdings' : 'Analyst Forecasts'}
            </button>
          ))}
        </div>

        {/* Holdings tab content */}
        {activeTab === 'holdings' && (
          <>
            {/* Filter bar + Actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-400 mr-1">Filter:</span>
                {FILTERS.map((f) => (
                  <Button
                    key={f.value}
                    variant={filter === f.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Holding
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    const res = await fetch('/api/export?type=holdings')
                    if (!res.ok) return
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `holdings-${new Date().toISOString().slice(0, 10)}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>
            <HoldingsTable key={tableKey} filterClass={filter} />
          </>
        )}

        {/* Forecasts tab content */}
        {activeTab === 'forecasts' && <ForecastsTab />}

        {/* Add holding modal */}
        {showAddModal && (
          <AddHoldingModal
            onClose={() => setShowAddModal(false)}
            onSaved={() => { fetchHoldings(); setTableKey((k) => k + 1) }}
          />
        )}
      </main>
    </div>
  )
}
