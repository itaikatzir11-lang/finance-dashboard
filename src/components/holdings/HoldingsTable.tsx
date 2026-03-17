'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Pencil, Trash2, ChevronDown, DollarSign, TrendingUp } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useFxRate } from '@/hooks/useFxRate'
import type { HoldingWithAccount, AssetClass, HoldingsResponse } from '@/types'

const ASSET_CLASS_OPTIONS: AssetClass[] = ['STOCK', 'ETF', 'CRYPTO', 'CASH', 'BOND', 'OTHER']

type SortField = 'symbol' | 'currentValue' | 'dailyChangePercent' | 'gainLoss' | 'quantity'
type SortDir = 'asc' | 'desc'

const ASSET_CLASS_BADGES: Record<AssetClass, { label: string; variant: 'default' | 'success' | 'warning' | 'outline' | 'secondary' }> = {
  STOCK:  { label: 'Stock',  variant: 'default' },
  ETF:    { label: 'ETF',    variant: 'secondary' },
  CRYPTO: { label: 'Crypto', variant: 'warning' },
  CASH:   { label: 'Cash',   variant: 'success' },
  BOND:   { label: 'Bond',   variant: 'outline' },
  OTHER:  { label: 'Other',  variant: 'outline' },
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  holding: HoldingWithAccount
  onClose: () => void
  onSaved: () => void
}

function EditHoldingModal({ holding, onClose, onSaved }: EditModalProps) {
  const [quantity, setQuantity] = useState(String(holding.quantity))
  const [avgCostBasis, setAvgCostBasis] = useState(holding.avgCostBasis != null ? String(holding.avgCostBasis) : '')
  const [assetClass, setAssetClass] = useState<AssetClass>(holding.assetClass)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewQty = parseFloat(quantity)
  const previewValue = Number.isFinite(previewQty) && previewQty >= 0
    ? previewQty * holding.currentPrice
    : null

  async function handleSave() {
    const qty = parseFloat(quantity)
    if (!Number.isFinite(qty) || qty < 0) { setError('Enter a valid quantity'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          avgCostBasis: avgCostBasis !== '' ? parseFloat(avgCostBasis) : null,
          assetClass,
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
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Edit Holding</h2>
        <p className="text-sm text-slate-400 mb-4">
          <span className="font-semibold text-slate-200">{holding.symbol}</span> — {holding.name}
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Avg Cost Basis <span className="text-slate-600">(optional)</span></label>
            <input
              type="number"
              min="0"
              step="any"
              value={avgCostBasis}
              onChange={(e) => setAvgCostBasis(e.target.value)}
              placeholder="e.g. 150.00"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Asset Class</label>
            <div className="relative">
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                className={inputCls + ' appearance-none pr-8'}
              >
                {ASSET_CLASS_OPTIONS.map((c) => (
                  <option key={c} value={c}>{ASSET_CLASS_BADGES[c].label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            </div>
          </div>

          {/* Live value preview */}
          <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {Number.isFinite(previewQty) && previewQty >= 0
                ? `${previewQty} × ${formatCurrency(holding.currentPrice)}`
                : 'Value preview'}
            </span>
            <span className="text-sm font-semibold font-mono text-slate-200">
              {previewValue != null ? formatCurrency(previewValue) : '—'}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <Button onClick={handleSave} loading={saving} className="flex-1">Save Changes</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ── Price Override Modal ──────────────────────────────────────────────────────

interface EditPriceModalProps {
  holding: HoldingWithAccount
  onClose: () => void
  onSaved: () => void
}

function EditPriceModal({ holding, onClose, onSaved }: EditPriceModalProps) {
  const [price, setPrice] = useState(String(holding.currentPrice))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewPrice = parseFloat(price)
  const previewValue = Number.isFinite(previewPrice) && previewPrice >= 0
    ? previewPrice * holding.quantity
    : null

  async function handleSave() {
    const val = parseFloat(price)
    if (!Number.isFinite(val) || val < 0) { setError('Enter a valid price'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/holdings/${holding.id}/price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: val }),
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
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Override Price</h2>
        <p className="text-sm text-slate-400 mb-4">
          <span className="font-semibold text-slate-200">{holding.symbol}</span> — {holding.name}
        </p>
        <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          This manually sets the price and will be overwritten on next price sync.
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Price <span className="text-slate-600">({holding.currency})</span></label>
            <input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 150.00"
              autoFocus
              className={inputCls}
            />
          </div>

          <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {Number.isFinite(previewPrice) && previewPrice >= 0
                ? `${holding.quantity} × ${formatCurrency(previewPrice, holding.currency)}`
                : 'Value preview'}
            </span>
            <span className="text-sm font-semibold font-mono text-slate-200">
              {previewValue != null ? formatCurrency(previewValue, holding.currency) : '—'}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <Button onClick={handleSave} loading={saving} className="flex-1">Set Price</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ── Sort Header ───────────────────────────────────────────────────────────────

interface SortHeaderProps {
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (field: SortField) => void
  children: React.ReactNode
  className?: string
}

function SortHeader({ field, current, dir, onSort, children, className }: SortHeaderProps) {
  const isActive = field === current
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 hover:text-slate-200 transition-colors"
      >
        {children}
        {isActive ? (
          dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface Props {
  filterClass?: AssetClass | 'ALL'
}

export function HoldingsTable({ filterClass = 'ALL' }: Props) {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<'db' | 'mock' | null>(null)
  const [sortField, setSortField] = useState<SortField>('currentValue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editTarget, setEditTarget] = useState<HoldingWithAccount | null>(null)
  const [priceTarget, setPriceTarget] = useState<HoldingWithAccount | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { usdToIls } = useFxRate()

  const fetchHoldings = useCallback(() => {
    setLoading(true)
    fetch('/api/holdings')
      .then((r) => r.json())
      .then((res: HoldingsResponse) => {
        setHoldings(Array.isArray(res.data) ? res.data : [])
        setDataSource(res.dataSource ?? 'db')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchHoldings() }, [fetchHoldings])

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  async function handleDelete(holding: HoldingWithAccount) {
    if (!confirm(`Delete ${holding.symbol} (${holding.name})? This cannot be undone.`)) return
    setDeletingId(holding.id)
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' })
      if (res.ok) fetchHoldings()
    } catch { /* silent */ }
    finally { setDeletingId(null) }
  }

  const filtered = useMemo(() => {
    return filterClass === 'ALL'
      ? holdings
      : holdings.filter((h) => h.assetClass === filterClass)
  }, [holdings, filterClass])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = 0, vb = 0
      if (sortField === 'symbol') {
        const cmp = a.symbol.localeCompare(b.symbol)
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (sortField === 'currentValue') { va = a.currentValue; vb = b.currentValue }
      if (sortField === 'dailyChangePercent') { va = a.dailyChangePercent; vb = b.dailyChangePercent }
      if (sortField === 'gainLoss') {
        va = a.avgCostBasis != null ? (a.currentPrice - a.avgCostBasis) * a.quantity : 0
        vb = b.avgCostBasis != null ? (b.currentPrice - b.avgCostBasis) * b.quantity : 0
      }
      if (sortField === 'quantity') { va = a.quantity; vb = b.quantity }
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [filtered, sortField, sortDir])

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      {dataSource === 'mock' && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-400">Sample data — connect DB to see real holdings</p>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHeader field="symbol" current={sortField} dir={sortDir} onSort={handleSort}>
              Symbol / Name
            </SortHeader>
            <TableHead>Asset Class</TableHead>
            <SortHeader field="quantity" current={sortField} dir={sortDir} onSort={handleSort} className="text-right">
              Quantity
            </SortHeader>
            <TableHead className="text-right">Avg Cost</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <SortHeader field="currentValue" current={sortField} dir={sortDir} onSort={handleSort} className="text-right">
              Value
            </SortHeader>
            <SortHeader field="dailyChangePercent" current={sortField} dir={sortDir} onSort={handleSort} className="text-right">
              Day %
            </SortHeader>
            <SortHeader field="gainLoss" current={sortField} dir={sortDir} onSort={handleSort} className="text-right">
              Gain ₪
            </SortHeader>
            <TableHead className="text-right">Gain %</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="animate-pulse">
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="h-3 w-14 rounded bg-slate-700" />
                    <div className="h-2.5 w-24 rounded bg-slate-800" />
                  </div>
                </TableCell>
                <TableCell><div className="h-5 w-12 rounded bg-slate-700" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-10 rounded bg-slate-700" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-12 rounded bg-slate-800" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-14 rounded bg-slate-700" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-16 rounded bg-slate-700" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-10 rounded bg-slate-800" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-14 rounded bg-slate-700" /></TableCell>
                <TableCell className="text-right"><div className="ml-auto h-3 w-10 rounded bg-slate-800" /></TableCell>
                <TableCell><div className="h-3 w-20 rounded bg-slate-700" /></TableCell>
                <TableCell />
              </TableRow>
            ))
          ) : sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11}>
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-slate-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">No holdings found</p>
                  <p className="text-xs text-slate-600">Add a position or import a CSV to get started</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((holding) => {
              const isClosed = holding.quantity === 0
              const gainLoss =
                holding.avgCostBasis != null
                  ? (holding.currentPrice - holding.avgCostBasis) * holding.quantity
                  : null
              const gainLossPct =
                holding.avgCostBasis != null && holding.avgCostBasis > 0
                  ? ((holding.currentPrice - holding.avgCostBasis) / holding.avgCostBasis) * 100
                  : null
              const dayChangeColor = getChangeColor(holding.dailyChangePercent)
              const gainLossColor = gainLoss != null ? getChangeColor(gainLoss) : 'text-slate-400'
              const gainLossBg = gainLoss == null ? '' : gainLoss >= 0 ? 'bg-emerald-500/[0.08]' : 'bg-rose-500/[0.08]'
              const dayChangeBg = holding.dailyChangePercent === 0 ? '' : holding.dailyChangePercent > 0 ? 'bg-emerald-500/[0.08]' : 'bg-rose-500/[0.08]'
              const badge = ASSET_CLASS_BADGES[holding.assetClass]

              return (
                <TableRow key={holding.id} className={isClosed ? 'opacity-40' : undefined}>
                  <TableCell>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${isClosed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {holding.symbol}
                        </span>
                        {isClosed && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 uppercase tracking-wide">
                            Closed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-[140px] truncate">{holding.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {holding.assetClass === 'CASH'
                      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(holding.quantity)
                      : holding.quantity < 1
                      ? holding.quantity.toFixed(4)
                      : holding.quantity.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-400">
                    {holding.avgCostBasis != null
                      ? formatCurrency(holding.avgCostBasis, holding.currency)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(holding.currentPrice, holding.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(
                      holding.currency === 'ILS' ? holding.currentValue : holding.currentValue * usdToIls,
                      'ILS'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-block tabular-nums font-medium rounded-sm px-1.5 py-0.5 ${dayChangeColor} ${dayChangeBg}`}>
                      {formatPercent(holding.dailyChangePercent)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-block tabular-nums font-medium rounded-sm px-1.5 py-0.5 ${gainLossColor} ${gainLossBg}`}>
                      {gainLoss != null
                        ? `${gainLoss >= 0 ? '+' : ''}${formatCurrency(
                            holding.currency === 'ILS' ? gainLoss : gainLoss * usdToIls,
                            'ILS'
                          )}`
                        : <span className="text-slate-500">—</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-block tabular-nums rounded-sm px-1.5 py-0.5 ${gainLossColor} ${gainLossBg}`}>
                      {gainLossPct != null
                        ? formatPercent(gainLossPct)
                        : <span className="text-slate-500">—</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-400">{holding.account.name}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditTarget(holding)}
                        className="text-slate-600 hover:text-indigo-400 transition-colors"
                        title="Edit holding"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setPriceTarget(holding)}
                        className="text-slate-600 hover:text-amber-400 transition-colors"
                        title="Override price"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(holding)}
                        disabled={deletingId === holding.id}
                        className="text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-40"
                        title="Delete holding"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {editTarget && (
        <EditHoldingModal
          holding={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchHoldings}
        />
      )}

      {priceTarget && (
        <EditPriceModal
          holding={priceTarget}
          onClose={() => setPriceTarget(null)}
          onSaved={fetchHoldings}
        />
      )}
    </div>
  )
}
