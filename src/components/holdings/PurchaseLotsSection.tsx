'use client'

/**
 * PurchaseLotsSection
 *
 * Shown inside Crypto account cards below the BTC/ETH holding viewer.
 * Lets the user record manual buy orders so the app can compute true
 * all-time ROI without needing a full transaction ledger.
 *
 * Data flow:
 *   GET  /api/holdings/[holdingId]/lots  → render lot history
 *   POST /api/holdings/[holdingId]/lots  → add lot, server recalculates avgCostBasis
 *   DELETE /api/holdings/[holdingId]/lots?lotId=X → remove lot
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, TrendingUp, TrendingDown, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PurchaseLot {
  id: string
  holdingId: string
  date: string
  quantity: number
  fiatCostUsd: number
  createdAt: string
}

interface PurchaseLotsSectionProps {
  holdingId: string
  /** Symbol displayed in the header (e.g. "BTC") */
  symbol: string
  /** Current live value of the holding in USD — used to compute ROI */
  currentValueUsd: number
  /** Called after any write so the parent can refresh account totals */
  onChanged: () => void
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PurchaseLotsSection({
  holdingId,
  symbol,
  currentValueUsd,
  onChanged,
}: PurchaseLotsSectionProps) {
  const [lots, setLots] = useState<PurchaseLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [date, setDate]       = useState('')
  const [qty, setQty]         = useState('')
  const [paid, setPaid]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchLots = useCallback(async () => {
    try {
      const res = await fetch(`/api/holdings/${holdingId}/lots`)
      if (res.ok) setLots(await res.json())
    } catch {
      setError('Could not load purchase history.')
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  useEffect(() => { fetchLots() }, [fetchLots])

  // ── Computed ROI ────────────────────────────────────────────────────────────
  const totalInvested = lots.reduce((s, l) => s + l.fiatCostUsd, 0)
  const totalQty      = lots.reduce((s, l) => s + l.quantity, 0)
  const roiUsd        = totalInvested > 0 ? currentValueUsd - totalInvested : null
  const roiPct        = totalInvested > 0 ? ((currentValueUsd - totalInvested) / totalInvested) * 100 : null
  const isPositive    = roiUsd !== null && roiUsd >= 0

  // ── Add lot ─────────────────────────────────────────────────────────────────
  async function handleAdd() {
    const quantity    = parseFloat(qty)
    const fiatCostUsd = parseFloat(paid)
    if (!date || isNaN(quantity) || quantity <= 0 || isNaN(fiatCostUsd) || fiatCostUsd <= 0) {
      setFormError('All fields are required and must be positive numbers.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/holdings/${holdingId}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, quantity, fiatCostUsd }),
      })
      if (!res.ok) {
        const j = await res.json()
        setFormError(j.error ?? 'Failed to save lot.')
        return
      }
      setDate(''); setQty(''); setPaid('')
      setShowForm(false)
      await fetchLots()
      onChanged()
    } catch {
      setFormError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete lot ──────────────────────────────────────────────────────────────
  async function handleDelete(lotId: string) {
    try {
      const res = await fetch(`/api/holdings/${holdingId}/lots?lotId=${lotId}`, { method: 'DELETE' })
      if (res.ok) { await fetchLots(); onChanged() }
    } catch { /* silent */ }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="mt-3 border border-slate-700/40 rounded-xl overflow-hidden shadow-sm shadow-slate-950/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-slate-800/60 to-slate-800/30 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-tight">{symbol} Purchase History</span>
          {lots.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded-full">{lots.length} lot{lots.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null) }}
          className="text-[11px] text-indigo-400 hover:text-indigo-200 flex items-center gap-1 transition-colors duration-150 hover:-translate-y-px"
        >
          <Plus className="h-3 w-3" />
          Add Lot
        </button>
      </div>

      <div className="px-3.5 py-3 bg-slate-900/30 space-y-3">

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-xs text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}

        {/* ROI summary — only shown when there's at least one lot */}
        {!loading && lots.length > 0 && roiUsd !== null && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 px-2.5 py-2">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-0.5">Invested</p>
              <p className="text-xs font-bold text-slate-200 tabular-nums tracking-tight">{formatCurrency(totalInvested)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 px-2.5 py-2">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-0.5">Now Worth</p>
              <p className="text-xs font-bold text-slate-200 tabular-nums tracking-tight">{formatCurrency(currentValueUsd)}</p>
            </div>
            <div className={`rounded-lg px-2.5 py-2 border transition-colors ${
              isPositive
                ? 'bg-emerald-950/40 border-emerald-700/30 ring-1 ring-emerald-500/15'
                : 'bg-rose-950/40 border-rose-700/30 ring-1 ring-rose-500/15'
            }`}>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-0.5">All-Time ROI</p>
              <p className={`text-xs font-bold tabular-nums tracking-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{formatCurrency(roiUsd)}
                {roiPct !== null && (
                  <span className="text-[10px] font-normal ml-1 opacity-80">
                    ({isPositive ? '+' : ''}{roiPct.toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Lot list */}
        {!loading && lots.length > 0 && (
          <div className="space-y-1.5">
            {lots.map((lot) => {
              const perUnit = lot.quantity > 0 ? lot.fiatCostUsd / lot.quantity : 0
              return (
                <div key={lot.id} className="flex items-center justify-between text-xs rounded px-1 -mx-1 py-0.5 hover:bg-slate-800/50 transition-colors duration-100 group">
                  <div className="text-slate-400">
                    <span className="text-slate-300 font-medium">{new Date(lot.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span>{lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol}</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span>{formatCurrency(perUnit)}/unit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-mono tabular-nums">{formatCurrency(lot.fiatCostUsd)}</span>
                    <button
                      onClick={() => handleDelete(lot.id)}
                      className="text-slate-700 group-hover:text-slate-500 hover:text-rose-400 transition-colors duration-150"
                      title="Remove lot"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })}
            {/* Total row */}
            <div className="flex items-center justify-between text-xs border-t border-slate-700/60 pt-1.5 mt-1">
              <span className="text-slate-500">Total ({totalQty.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol})</span>
              <span className="text-slate-300 font-semibold font-mono tabular-nums">{formatCurrency(totalInvested)}</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && lots.length === 0 && !showForm && (
          <p className="text-[11px] text-slate-500">
            No purchase lots yet. Add your buy orders to track all-time ROI.
          </p>
        )}

        {/* Add-lot form */}
        {showForm && (
          <div className="space-y-2 pt-1 border-t border-slate-700/60">
            <p className="text-[11px] font-medium text-slate-400">New Purchase Lot</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Quantity ({symbol})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0.5"
                  className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Total Paid (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  placeholder="25000"
                  className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Live preview */}
            {qty && paid && parseFloat(qty) > 0 && parseFloat(paid) > 0 && (
              <p className="text-[10px] text-slate-500">
                Cost basis:{' '}
                <span className="text-slate-300 font-mono">
                  {formatCurrency(parseFloat(paid) / parseFloat(qty))}/{symbol}
                </span>
              </p>
            )}

            {formError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{formError}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 text-white border-transparent text-xs h-7 gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {saving ? 'Saving…' : 'Add Lot'}
              </Button>
              <button
                onClick={() => { setShowForm(false); setFormError(null) }}
                className="text-xs text-slate-500 hover:text-slate-300 px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
