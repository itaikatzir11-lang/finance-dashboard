'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { isValidBTCAddress, maskBTCAddress } from '@/lib/btc-address'
import type { AccountWithStats, AccountType } from '@/types'
import type { BTCHoldingData } from '@/app/api/accounts/[id]/btc-holding/route'
import type { ETHHoldingData } from '@/app/api/accounts/[id]/eth-holding/route'
import {
  Building2, Bitcoin, LineChart, Landmark, RefreshCw, Plus, AlertCircle,
  CheckCircle, Info, Eye, EyeOff, Trash2, Shield, Pencil, Lock,
  Search, Loader2, TrendingUp, TrendingDown, X,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import type { AssetClass, HoldingWithAccount } from '@/types'
import { HoldingsPDFImport } from '@/components/holdings/HoldingsPDFImport'
import { PurchaseLotsSection } from '@/components/holdings/PurchaseLotsSection'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_ICONS: Record<AccountType, React.ReactNode> = {
  BANK:      <Building2 className="h-5 w-5" />,
  CRYPTO:    <Bitcoin className="h-5 w-5" />,
  BROKERAGE: <LineChart className="h-5 w-5" />,
  PENSION:   <Landmark className="h-5 w-5" />,
}

const ACCOUNT_COLORS: Record<AccountType, string> = {
  BANK:      'bg-emerald-500/20 text-emerald-400',
  CRYPTO:    'bg-amber-500/20 text-amber-400',
  BROKERAGE: 'bg-indigo-500/20 text-indigo-400',
  PENSION:   'bg-purple-500/20 text-purple-400',
}

// ---------------------------------------------------------------------------
// BTC Address Section — inline within the crypto account card
// ---------------------------------------------------------------------------

interface BTCAddressSectionProps {
  accountId: string
  /** Masked version returned by API, e.g. "bc1q...abcdef" */
  maskedAddress: string | null
  addressType: string | null
  onChanged: () => void
}

function BTCAddressSection({ accountId, maskedAddress, addressType, onChanged }: BTCAddressSectionProps) {
  const [mode, setMode] = useState<'idle' | 'adding' | 'removing'>('idle')
  const [inputValue, setInputValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  // Live client-side validation as the user types
  function handleInput(value: string) {
    setInputValue(value)
    setValidationError(null)
    if (value.trim() && !isValidBTCAddress(value.trim())) {
      setValidationError('Not a valid BTC address. Supported: bc1q..., bc1p..., 1..., 3...')
    }
  }

  async function handleSave() {
    const trimmed = inputValue.trim()
    if (!isValidBTCAddress(trimmed)) {
      setValidationError('Please enter a valid BTC address.')
      return
    }
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}/btc-address`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ message: `Watch-only address saved: ${data.btcAddressMasked}`, ok: true })
        setMode('idle')
        setInputValue('')
        onChanged()
      } else {
        setFeedback({ message: data.error ?? 'Failed to save address', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove() {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}/btc-address`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ message: 'Watch-only address removed. Reverted to manual mode.', ok: true })
        setMode('idle')
        onChanged()
      } else {
        setFeedback({ message: data.error ?? 'Failed to remove address', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-slate-300">
            {maskedAddress ? 'Watch-only mode' : 'Manual mode'}
          </span>
          {maskedAddress && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">active</Badge>
          )}
        </div>
        {maskedAddress ? (
          <button
            onClick={() => { setMode('removing'); setFeedback(null) }}
            className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        ) : (
          <button
            onClick={() => { setMode(mode === 'adding' ? 'idle' : 'adding'); setFeedback(null); setInputValue(''); setValidationError(null) }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            {mode === 'adding' ? (
              <><EyeOff className="h-3 w-3" /> Cancel</>
            ) : (
              <><Eye className="h-3 w-3" /> Add watch-only address</>
            )}
          </button>
        )}
      </div>

      {/* Current address display */}
      {maskedAddress && mode !== 'removing' && (
        <div className="px-3 py-2 bg-slate-800/20">
          <div className="flex items-center gap-2">
            <code className="text-xs text-amber-300 font-mono">{maskedAddress}</code>
            {addressType && (
              <span className="text-[10px] text-slate-500">{addressType}</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Syncing real on-chain balance. Full address stored privately in DB, never transmitted to browser.
          </p>
        </div>
      )}

      {/* Manual mode description */}
      {!maskedAddress && mode === 'idle' && (
        <div className="px-3 py-2 bg-slate-800/20">
          <p className="text-[11px] text-slate-500">
            BTC quantity is entered manually. Live price is fetched automatically.
            Value = quantity × market price. No wallet address required.
          </p>
        </div>
      )}

      {/* Add address form */}
      {mode === 'adding' && (
        <div className="px-3 py-3 bg-slate-800/20 space-y-2.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Public BTC address (watch-only, read-only)
            </label>
            <input
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="bc1q... or 1... or 3..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/60 placeholder:text-slate-600"
            />
            {validationError && (
              <p className="text-[11px] text-rose-400 mt-1">{validationError}</p>
            )}
            {inputValue && !validationError && (
              <p className="text-[11px] text-slate-500 mt-1">
                Preview: <code className="text-amber-300">{maskBTCAddress(inputValue.trim())}</code>
                {' '}— only this masked version will be shown in the UI.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={loading || !!validationError || !inputValue.trim()}
              className="flex-1 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {loading ? 'Saving…' : 'Save address'}
            </button>
            <button
              onClick={() => { setMode('idle'); setInputValue(''); setValidationError(null) }}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            This is your public address only. Private keys and seed phrases are never stored here.
          </p>
        </div>
      )}

      {/* Remove confirmation */}
      {mode === 'removing' && (
        <div className="px-3 py-3 bg-rose-900/10 space-y-2.5">
          <p className="text-xs text-slate-300">
            Remove <code className="text-amber-300">{maskedAddress}</code>?
            The app will revert to manual mode (quantity × live price).
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              disabled={loading}
              className="flex-1 rounded-md bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {loading ? 'Removing…' : 'Remove address'}
            </button>
            <button
              onClick={() => setMode('idle')}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${
          feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'
        }`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BTC Holding Editor
// Shown inside the CRYPTO account card when in manual mode.
// Hidden (read-only notice) when watch-only mode is active.
// ---------------------------------------------------------------------------

interface BTCHoldingEditorProps {
  accountId: string
  isWatchOnly: boolean
  onSaved: () => void
}

function BTCHoldingEditor({ accountId, isWatchOnly, onSaved }: BTCHoldingEditorProps) {
  const [data, setData] = useState<BTCHoldingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qtyInput, setQtyInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  // Derived: live preview of value while user edits qty
  const previewQty = parseFloat(qtyInput)
  const previewValue = data && Number.isFinite(previewQty) && previewQty >= 0
    ? previewQty * data.currentPrice
    : null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounts/${accountId}/btc-holding`)
      if (res.ok) {
        const d: BTCHoldingData = await res.json()
        setData(d)
        setQtyInput(d.quantity > 0 ? String(d.quantity) : '')
        setCostInput(d.avgCostBasis != null ? String(d.avgCostBasis) : '')
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [accountId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    const qty = parseFloat(qtyInput)
    if (!Number.isFinite(qty) || qty < 0) {
      setFeedback({ message: 'Enter a valid quantity (e.g. 0.5)', ok: false })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}/btc-holding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          avgCostBasis: costInput !== '' ? parseFloat(costInput) : null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setData(json)
        setEditing(false)
        setFeedback({ message: `Saved — ${qty} BTC × $${json.currentPrice.toLocaleString()} = ${formatCurrency(json.currentValue)}`, ok: true })
        onSaved()
      } else {
        setFeedback({ message: json.error ?? 'Save failed', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setFeedback(null)
    if (data) {
      setQtyInput(data.quantity > 0 ? String(data.quantity) : '')
      setCostInput(data.avgCostBasis != null ? String(data.avgCostBasis) : '')
    }
  }

  if (loading) {
    return (
      <div className="mt-3 border border-slate-700/60 rounded-lg px-3 py-3 bg-slate-800/20 animate-pulse h-24" />
    )
  }

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <Bitcoin className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-slate-300">BTC Holdings</span>
          {isWatchOnly && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">watch-only</Badge>
          )}
        </div>
        {!isWatchOnly && !editing && (
          <button
            onClick={() => { setEditing(true); setFeedback(null) }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {/* Watch-only: quantity is from chain, read-only */}
      {isWatchOnly ? (
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          <Row label="Quantity" value={data ? `${data.quantity.toFixed(6)} BTC` : '—'} />
          <Row label="Live price" value={data ? formatCurrency(data.currentPrice) : '—'} badge="LIVE" />
          <Row label="Current value" value={data ? formatCurrency(data.currentValue) : '—'} highlight />
          <div className="flex items-center gap-1.5 pt-1">
            <Lock className="h-3 w-3 text-slate-600" />
            <p className="text-[11px] text-slate-600">
              Quantity is synced from the blockchain. Remove watch-only address to edit manually.
            </p>
          </div>
        </div>
      ) : editing ? (
        /* Edit form */
        <div className="px-3 py-3 bg-slate-800/20 space-y-3">
          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              BTC Quantity <span className="text-slate-500">(editable)</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="e.g. 0.5"
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/60 placeholder:text-slate-600"
            />
          </div>

          {/* Avg Cost Basis */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Avg Cost Basis <span className="text-slate-500">(optional, USD per BTC)</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="e.g. 42000"
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600"
            />
          </div>

          {/* Live price — read-only */}
          <div className="rounded-md bg-slate-800/60 px-2.5 py-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Live BTC price</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-300">
                {data ? formatCurrency(data.currentPrice) : '—'}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium uppercase tracking-wide">
                {data?.priceSource ?? 'live'}
              </span>
            </div>
          </div>

          {/* Live value preview */}
          {previewValue !== null && (
            <div className="rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {Number.isFinite(previewQty) ? `${previewQty} BTC × ${formatCurrency(data!.currentPrice)}` : 'Value'}
              </span>
              <span className="text-sm font-semibold text-amber-300 font-mono">
                {formatCurrency(previewValue)}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving || qtyInput === ''}
              className="flex-1 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Read view */
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          <Row label="Quantity" value={data && data.quantity > 0 ? `${data.quantity.toFixed(6)} BTC` : 'Not set'} />
          {data?.avgCostBasis != null && (
            <Row label="Avg cost" value={formatCurrency(data.avgCostBasis)} />
          )}
          <Row
            label="Live price"
            value={data ? formatCurrency(data.currentPrice) : '—'}
            badge={data?.priceSource ?? 'live'}
          />
          <Row
            label="Current value"
            value={data && data.quantity > 0 ? formatCurrency(data.currentValue) : '—'}
            highlight={!!(data && data.quantity > 0)}
          />
          {(!data || data.quantity === 0) && (
            <p className="text-[11px] text-slate-500 pt-1">
              Enter your BTC quantity to see your current value.
            </p>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'}`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ETH Holding Editor
// Shown inside the CRYPTO account card when in manual mode.
// Hidden (read-only notice) when watch-only mode is active.
// ---------------------------------------------------------------------------

interface ETHHoldingEditorProps {
  accountId: string
  isWatchOnly: boolean
  onSaved: () => void
}

function ETHHoldingEditor({ accountId, isWatchOnly, onSaved }: ETHHoldingEditorProps) {
  const [data, setData] = useState<ETHHoldingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qtyInput, setQtyInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  const previewQty = parseFloat(qtyInput)
  const previewValue = data && Number.isFinite(previewQty) && previewQty >= 0
    ? previewQty * data.currentPrice
    : null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounts/${accountId}/eth-holding`)
      if (res.ok) {
        const d: ETHHoldingData = await res.json()
        setData(d)
        setQtyInput(d.quantity > 0 ? String(d.quantity) : '')
        setCostInput(d.avgCostBasis != null ? String(d.avgCostBasis) : '')
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [accountId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    const qty = parseFloat(qtyInput)
    if (!Number.isFinite(qty) || qty < 0) {
      setFeedback({ message: 'Enter a valid quantity (e.g. 2.5)', ok: false })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}/eth-holding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          avgCostBasis: costInput !== '' ? parseFloat(costInput) : null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setData(json)
        setEditing(false)
        setFeedback({ message: `Saved — ${qty} ETH × $${json.currentPrice.toLocaleString()} = ${formatCurrency(json.currentValue)}`, ok: true })
        onSaved()
      } else {
        setFeedback({ message: json.error ?? 'Save failed', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setFeedback(null)
    if (data) {
      setQtyInput(data.quantity > 0 ? String(data.quantity) : '')
      setCostInput(data.avgCostBasis != null ? String(data.avgCostBasis) : '')
    }
  }

  if (loading) {
    return (
      <div className="mt-3 border border-slate-700/60 rounded-lg px-3 py-3 bg-slate-800/20 animate-pulse h-24" />
    )
  }

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-medium text-slate-300">ETH Holdings</span>
          {isWatchOnly && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">watch-only</Badge>
          )}
        </div>
        {!isWatchOnly && !editing && (
          <button
            onClick={() => { setEditing(true); setFeedback(null) }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {/* Watch-only: quantity is from chain, read-only */}
      {isWatchOnly ? (
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          <Row label="Quantity" value={data ? `${data.quantity.toFixed(6)} ETH` : '—'} />
          <Row label="Live price" value={data ? formatCurrency(data.currentPrice) : '—'} badge="LIVE" />
          <Row label="Current value" value={data ? formatCurrency(data.currentValue) : '—'} highlight />
          <div className="flex items-center gap-1.5 pt-1">
            <Lock className="h-3 w-3 text-slate-600" />
            <p className="text-[11px] text-slate-600">
              Quantity is synced from the blockchain. Remove watch-only address to edit manually.
            </p>
          </div>
        </div>
      ) : editing ? (
        /* Edit form */
        <div className="px-3 py-3 bg-slate-800/20 space-y-3">
          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              ETH Quantity <span className="text-slate-500">(editable)</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600"
            />
          </div>

          {/* Avg Cost Basis */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Avg Cost Basis <span className="text-slate-500">(optional, USD per ETH)</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="e.g. 1800"
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600"
            />
          </div>

          {/* Live price — read-only */}
          <div className="rounded-md bg-slate-800/60 px-2.5 py-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Live ETH price</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-300">
                {data ? formatCurrency(data.currentPrice) : '—'}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium uppercase tracking-wide">
                {data?.priceSource ?? 'live'}
              </span>
            </div>
          </div>

          {/* Live value preview */}
          {previewValue !== null && (
            <div className="rounded-md bg-indigo-500/5 border border-indigo-500/20 px-2.5 py-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {Number.isFinite(previewQty) ? `${previewQty} ETH × ${formatCurrency(data!.currentPrice)}` : 'Value'}
              </span>
              <span className="text-sm font-semibold text-indigo-300 font-mono">
                {formatCurrency(previewValue)}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving || qtyInput === ''}
              className="flex-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Read view */
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          <Row label="Quantity" value={data && data.quantity > 0 ? `${data.quantity.toFixed(6)} ETH` : 'Not set'} />
          {data?.avgCostBasis != null && (
            <Row label="Avg cost" value={formatCurrency(data.avgCostBasis)} />
          )}
          <Row
            label="Live price"
            value={data ? formatCurrency(data.currentPrice) : '—'}
            badge={data?.priceSource ?? 'live'}
          />
          <Row
            label="Current value"
            value={data && data.quantity > 0 ? formatCurrency(data.currentValue) : '—'}
            highlight={!!(data && data.quantity > 0)}
          />
          {(!data || data.quantity === 0) && (
            <p className="text-[11px] text-slate-500 pt-1">
              Enter your ETH quantity to see your current value.
            </p>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'}`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}

/** Simple label/value row used inside the holding editor */
function Row({ label, value, badge, highlight }: {
  label: string
  value: string
  badge?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-mono ${highlight ? 'text-amber-300 font-semibold' : 'text-slate-300'}`}>
          {value}
        </span>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bank Balance Section
// Shown inside BANK account cards. Lets the user update the static ILS balance.
// ---------------------------------------------------------------------------

interface BankBalanceSectionProps {
  accountId: string
  currentBalance: number
  currency: string
  onSaved: () => void
}

function BankBalanceSection({ accountId, currentBalance, currency, onSaved }: BankBalanceSectionProps) {
  const [editing, setEditing] = useState(currentBalance === 0)
  const [input, setInput] = useState(String(currentBalance))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  function beginEdit() {
    setInput(String(currentBalance))
    setFeedback(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setInput(String(currentBalance))
  }

  async function handleSave() {
    const value = parseFloat(input.replace(/,/g, ''))
    if (!Number.isFinite(value) || value < 0) {
      setFeedback({ message: 'Enter a valid positive balance.', ok: false })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: value }),
      })
      const json = await res.json()
      if (res.ok) {
        setEditing(false)
        setFeedback({ message: `Balance updated to ${formatCurrency(value, currency === 'ILS' ? 'ILS' : 'USD')}`, ok: true })
        onSaved()
      } else {
        setFeedback({ message: json.error ?? 'Save failed', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const displayBalance = formatCurrency(currentBalance, currency === 'ILS' ? 'ILS' : 'USD')

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-slate-300">Account Balance</span>
        </div>
        {!editing && (
          <button
            onClick={beginEdit}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            Update
          </button>
        )}
      </div>

      {editing ? (
        <div className="px-3 py-3 bg-slate-800/20 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Current balance <span className="text-slate-500">({currency})</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 25000"
              autoFocus
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/60 placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Enter the balance shown in your {currency === 'ILS' ? 'Discount Bank' : 'bank'} account. This is stored as-is and not calculated from transactions.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || input === ''}
              className="flex-1 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Balance'}
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          <Row label="Current balance" value={currentBalance > 0 ? displayBalance : 'Not set'} highlight={currentBalance > 0} />
          {currentBalance === 0 && (
            <p className="text-[11px] text-slate-500">
              Click Update to enter your current account balance.
            </p>
          )}
        </div>
      )}


      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'}`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Pension Balance Section
// Shown inside PENSION account cards. Lets the user update the manual ILS
// balance and wires a live SPY holding for S&P 500 performance tracking.
// ---------------------------------------------------------------------------

interface PensionBalanceSectionProps {
  accountId: string
  currentBalance: number
  currency: string
  metadata: Record<string, unknown>
  onSaved: () => void
}

function PensionBalanceSection({ accountId, currentBalance, currency, metadata, onSaved }: PensionBalanceSectionProps) {
  const [editing, setEditing]     = useState(currentBalance === 0)
  const [input, setInput]         = useState(String(currentBalance || ''))
  const [dateInput, setDateInput] = useState((metadata.pensionBaseDate as string) ?? '')
  const [symbol, setSymbol]       = useState((metadata.pensionTrackedSymbol as string) ?? 'SPY')
  const [saving, setSaving]       = useState(false)
  const [feedback, setFeedback]   = useState<{ message: string; ok: boolean } | null>(null)

  const baseDate      = (metadata.pensionBaseDate      as string) ?? ''
  const baseDatePrice = (metadata.pensionBaseDatePrice as number) ?? 0
  const trackedSymbol = (metadata.pensionTrackedSymbol as string) ?? 'SPY'

  async function handleSave() {
    const value = parseFloat(input.replace(/,/g, ''))
    if (!Number.isFinite(value) || value < 0) {
      setFeedback({ message: 'Enter a valid positive balance.', ok: false })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance: value,
          metadata: {
            pensionBaseBalance:   value,
            pensionBaseDate:      dateInput || new Date().toISOString().slice(0, 10),
            pensionTrackedSymbol: (symbol || 'SPY').toUpperCase(),
          },
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setEditing(false)
        setFeedback({ message: `Baseline saved. Now tracking ${(symbol || 'SPY').toUpperCase()} live.`, ok: true })
        onSaved()
      } else {
        setFeedback({ message: json.error ?? 'Save failed', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const displayBalance = formatCurrency(currentBalance, currency === 'ILS' ? 'ILS' : 'USD')

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-slate-300">Live Pension Engine</span>
          <span className="text-[10px] text-slate-500 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">
            tracking {trackedSymbol}
          </span>
        </div>
        {!editing && (
          <button
            onClick={() => { setInput(String(currentBalance || '')); setDateInput(baseDate); setSymbol(trackedSymbol); setFeedback(null); setEditing(true) }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            Update Baseline
          </button>
        )}
      </div>

      {editing ? (
        <div className="px-3 py-3 bg-slate-800/20 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Official balance <span className="text-slate-500">({currency})</span>
              </label>
              <input
                type="number" min="0" step="any" value={input} autoFocus
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. 250000"
                className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/60 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Reporting date</label>
              <input
                type="date" value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/60"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Tracking ticker <span className="text-slate-500">(default: SPY = S&amp;P 500)</span>
            </label>
            <input
              type="text" value={symbol} maxLength={10}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="SPY"
              className="w-36 rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-purple-500/60 placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              A virtual holding for this ticker will be created and its live price used to estimate
              your pension&apos;s current value automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave} disabled={saving || !input}
              className="flex-1 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Baseline'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 bg-slate-800/20 space-y-2">
          {currentBalance > 0 ? (
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                  Official Balance
                  {baseDate ? ` · as of ${new Date(baseDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                </p>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">{displayBalance}</p>
              </div>
              {baseDatePrice > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{trackedSymbol} at baseline</p>
                  <p className="text-sm text-slate-400 font-mono tabular-nums">
                    ${baseDatePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Click &ldquo;Update Baseline&rdquo; to enter your pension balance and start live index tracking.
            </p>
          )}
        </div>
      )}

      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'}`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pension Holdings Section
// Shown inside PENSION account cards below the balance editor.
// Fetches the virtual SPY holding and renders a concise position summary.
// ---------------------------------------------------------------------------

interface PensionHoldingsSectionProps {
  accountId: string
  // Baseline metadata for computing growth since the official reporting date
  baseBalance: number        // official ILS balance at baseline
  baseDatePrice: number      // ticker price at baseline (USD)
  accountCurrency: string
}

function PensionHoldingsSection({ accountId, baseBalance, baseDatePrice, accountCurrency }: PensionHoldingsSectionProps) {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [ilsPerUsd, setIlsPerUsd] = useState(3.7)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [holdingsRes, fxRes] = await Promise.all([
        fetch(`/api/holdings?accountId=${accountId}`),
        fetch('/api/fx-rate'),
      ])
      const holdingsJson = await holdingsRes.json()
      setHoldings(Array.isArray(holdingsJson.data) ? holdingsJson.data : [])
      if (fxRes.ok) {
        const fxJson = await fxRes.json()
        if (fxJson.ilsToUsd > 0) setIlsPerUsd(1 / fxJson.ilsToUsd)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [accountId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="mt-3 border border-slate-700/60 rounded-lg p-3 space-y-2 animate-pulse">
        <div className="h-3 w-24 rounded bg-slate-800" />
        <div className="h-8 rounded bg-slate-800" />
      </div>
    )
  }

  if (holdings.length === 0) return null

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/40">
        <TrendingUp className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-medium text-slate-300">Live Estimated Value</span>
        <span className="text-[10px] text-slate-500">vs official baseline</span>
      </div>
      <div className="divide-y divide-slate-800/60">
        {holdings.map((h) => {
          // Growth factor: how much has the ticker grown since the baseline price?
          const growthFactor = baseDatePrice > 0 && h.currentPrice > 0
            ? h.currentPrice / baseDatePrice
            : null

          // Live estimated balance: apply growth to the official ILS baseline
          const liveEstimateIls = growthFactor != null && baseBalance > 0
            ? baseBalance * growthFactor
            : null

          // Also show the USD value from the holding directly
          const liveValueUsd = h.currentValue

          const growthPct = growthFactor != null ? (growthFactor - 1) * 100 : null
          const growthIls = liveEstimateIls != null ? liveEstimateIls - baseBalance : null
          const positive  = growthPct != null ? growthPct >= 0 : null

          return (
            <div key={h.id} className="px-3 py-3 bg-slate-800/20 space-y-2.5">
              {/* Live estimated value — prominent display */}
              {liveEstimateIls != null && (
                <div className={`rounded-lg px-3 py-2 flex items-center justify-between ${positive ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-rose-900/20 border border-rose-800/40'}`}>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Live Estimated Value</p>
                    <p className={`text-base font-bold tabular-nums ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatCurrency(liveEstimateIls, accountCurrency === 'ILS' ? 'ILS' : 'USD')}
                    </p>
                  </div>
                  <div className="text-right">
                    {growthPct !== null && growthIls !== null && (
                      <span className={`text-sm font-semibold tabular-nums flex items-center gap-0.5 justify-end ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {positive ? '+' : ''}{growthPct.toFixed(1)}%
                      </span>
                    )}
                    {growthIls !== null && (
                      <p className={`text-xs tabular-nums mt-0.5 ${positive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {positive ? '+' : ''}{formatCurrency(growthIls, 'ILS')} since baseline
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Ticker detail row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-200">{h.symbol ?? h.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums ${h.dailyChangePercent >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                    {h.dailyChangePercent >= 0 ? '+' : ''}{h.dailyChangePercent.toFixed(2)}% today
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {formatCurrency(liveValueUsd)} USD
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares · {formatCurrency(h.currentPrice)}/share
                {baseDatePrice > 0 && (
                  <span className="text-slate-600 ml-2">· baseline {formatCurrency(baseDatePrice)}/share</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Brokerage Holdings Section
// Shown inside BROKERAGE account cards. Lets the user add/remove stock,
// ETF, fund, or bond positions. Symbol lookup fetches the live price.
// ---------------------------------------------------------------------------


interface PriceLookup {
  price: number
  changePercent24h: number
  currency: string
  source: string
  name?: string
}

interface BrokerageHoldingsSectionProps {
  accountId: string
  onSaved: () => void
}

function BrokerageHoldingsSection({ accountId, onSaved }: BrokerageHoldingsSectionProps) {
  const [holdings, setHoldings] = useState<HoldingWithAccount[]>([])
  const [loadingHoldings, setLoadingHoldings] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Add-position form state
  const [symbolInput, setSymbolInput] = useState('')
  const [lookupResult, setLookupResult] = useState<PriceLookup | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [qtyInput, setQtyInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [assetClass, setAssetClass] = useState<AssetClass>('STOCK')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  // Per-row delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadHoldings = useCallback(async () => {
    setLoadingHoldings(true)
    try {
      const res = await fetch(`/api/holdings?accountId=${accountId}`)
      const json = await res.json()
      setHoldings(Array.isArray(json.data) ? json.data : [])
    } catch { /* silent */ }
    finally { setLoadingHoldings(false) }
  }, [accountId])

  useEffect(() => { loadHoldings() }, [loadHoldings])

  async function handleLookup() {
    const symbol = symbolInput.trim().toUpperCase()
    if (!symbol) return
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    try {
      const res = await fetch(`/api/holdings/price?symbol=${symbol}`)
      const json = await res.json()
      if (res.ok && json.price > 0) {
        setLookupResult(json)
        setNameInput(json.name ?? symbol)
      } else {
        setLookupError(json.error ?? `Could not find price for "${symbol}". Check the ticker symbol and try again.`)
      }
    } catch {
      setLookupError('Network error — could not reach the price API.')
    } finally {
      setLookupLoading(false)
    }
  }

  function resetForm() {
    setSymbolInput('')
    setLookupResult(null)
    setLookupError(null)
    setNameInput('')
    setQtyInput('')
    setCostInput('')
    setAssetClass('STOCK')
    setFeedback(null)
  }

  function handleCancel() {
    setShowForm(false)
    resetForm()
  }

  async function handleSave() {
    if (assetClass === 'CASH') {
      const amount = parseFloat(qtyInput)
      if (!Number.isFinite(amount) || amount <= 0) { setFeedback({ message: 'Enter a valid positive amount.', ok: false }); return }
      if (!nameInput.trim()) { setFeedback({ message: 'Enter a name for this cash position.', ok: false }); return }
      setSaving(true)
      setFeedback(null)
      try {
        const res = await fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            symbol: 'CASH',
            name: nameInput.trim(),
            assetClass: 'CASH',
            quantity: amount,
            currentPrice: 1,
            avgCostBasis: 1,
            currency: 'ILS',
          }),
        })
        const json = await res.json()
        if (res.ok) {
          setFeedback({ message: `Added cash: ${formatCurrency(amount, 'ILS')}`, ok: true })
          setShowForm(false)
          resetForm()
          loadHoldings()
          onSaved()
        } else {
          setFeedback({ message: json.error ?? 'Failed to save position', ok: false })
        }
      } catch {
        setFeedback({ message: 'Network error', ok: false })
      } finally {
        setSaving(false)
      }
      return
    }

    const qty = parseFloat(qtyInput)
    if (!lookupResult) { setFeedback({ message: 'Look up a symbol first.', ok: false }); return }
    if (!Number.isFinite(qty) || qty <= 0) { setFeedback({ message: 'Enter a valid quantity greater than 0.', ok: false }); return }
    if (!nameInput.trim()) { setFeedback({ message: 'Enter a name for this position.', ok: false }); return }

    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          symbol: symbolInput.trim().toUpperCase(),
          name: nameInput.trim(),
          assetClass,
          quantity: qty,
          currentPrice: lookupResult.price,
          avgCostBasis: costInput !== '' ? parseFloat(costInput) : null,
          currency: lookupResult.currency ?? 'USD',
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setFeedback({ message: `Added ${qty} × ${symbolInput.toUpperCase()} at $${lookupResult.price.toLocaleString()}`, ok: true })
        setShowForm(false)
        resetForm()
        loadHoldings()
        onSaved()
      } else {
        setFeedback({ message: json.error ?? 'Failed to save position', ok: false })
      }
    } catch {
      setFeedback({ message: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(holding: HoldingWithAccount) {
    if (!confirm(`Remove ${holding.symbol} (${holding.name}) from this account?`)) return
    setDeletingId(holding.id)
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' })
      if (res.ok) { loadHoldings(); onSaved() }
    } catch { /* silent */ }
    finally { setDeletingId(null) }
  }

  const previewQty = parseFloat(qtyInput)
  const previewValue = lookupResult && Number.isFinite(previewQty) && previewQty > 0
    ? previewQty * lookupResult.price
    : null

  const inputCls = 'w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/60 placeholder:text-slate-600'
  const labelCls = 'block text-[11px] font-medium text-slate-400 mb-1'

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-medium text-slate-300">Positions</span>
          {!loadingHoldings && (
            <span className="text-[10px] text-slate-500">({holdings.length})</span>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setFeedback(null) }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Position
          </button>
        )}
      </div>

      {/* Existing holdings list */}
      {loadingHoldings ? (
        <div className="px-3 py-3 bg-slate-800/20 animate-pulse h-12" />
      ) : holdings.length === 0 && !showForm ? (
        <div className="px-3 py-3 bg-slate-800/20">
          <p className="text-[11px] text-slate-500">
            No positions yet. Click Add Position to enter your holdings.
          </p>
        </div>
      ) : holdings.length > 0 && (
        <div className="bg-slate-800/20 divide-y divide-slate-800/60">
          {holdings.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0">
                  <span className="text-xs font-semibold text-slate-100">{h.symbol}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 truncate max-w-[120px]">{h.name}</p>
                  {h.assetClass === 'CASH' ? (
                    <p className="text-[10px] text-slate-600">Uninvested cash</p>
                  ) : (
                    <p className="text-[10px] text-slate-600">
                      {h.quantity < 1 ? h.quantity.toFixed(4) : h.quantity.toFixed(2)} × {formatCurrency(h.currentPrice, h.currency)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-xs font-semibold font-mono text-slate-100">
                    {formatCurrency(h.currentValue, h.currency)}
                  </p>
                  {h.dailyChangePercent !== 0 && (
                    <p className={`text-[10px] ${h.dailyChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.dailyChangePercent >= 0 ? <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="inline h-2.5 w-2.5 mr-0.5" />}
                      {h.dailyChangePercent >= 0 ? '+' : ''}{h.dailyChangePercent.toFixed(2)}%
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(h)}
                  disabled={deletingId === h.id}
                  className="text-slate-700 hover:text-rose-400 transition-colors disabled:opacity-40"
                  title="Remove position"
                >
                  {deletingId === h.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <X className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add position form */}
      {showForm && (
        <div className="px-3 py-3 bg-slate-800/20 border-t border-slate-700/60 space-y-3">
          <p className="text-[11px] font-medium text-slate-300">New Position</p>

          {/* Investment / Cash toggle */}
          <div className="flex gap-1.5">
            {(['STOCK', 'CASH'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setAssetClass(c)
                  setLookupResult(null)
                  setLookupError(null)
                  setSymbolInput('')
                  setQtyInput('')
                  setNameInput('')
                }}
                className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
                  assetClass === c
                    ? 'bg-indigo-700/50 border-indigo-500/50 text-indigo-200'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {c === 'CASH' ? 'Cash' : 'Investment'}
              </button>
            ))}
          </div>

          {assetClass === 'CASH' ? (
            /* ── Cash entry — no symbol lookup needed ── */
            <>
              <div>
                <label className={labelCls}>Label <span className="text-slate-600">(e.g. "Uninvested Cash")</span></label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Uninvested Cash"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Amount <span className="text-slate-500">(ILS)</span></label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  placeholder="e.g. 5000"
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This cash amount counts toward your green Cash bucket on the dashboard.
                </p>
              </div>
            </>
          ) : (
            /* ── Investment entry — symbol lookup required ── */
            <>
              {/* Symbol lookup row */}
              <div>
                <label className={labelCls}>Ticker Symbol</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={symbolInput}
                    onChange={(e) => {
                      setSymbolInput(e.target.value.toUpperCase())
                      setLookupResult(null)
                      setLookupError(null)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLookup() }}
                    placeholder="e.g. AAPL, VOO, QQQ"
                    className={inputCls + ' flex-1 uppercase'}
                  />
                  <button
                    onClick={handleLookup}
                    disabled={lookupLoading || !symbolInput.trim()}
                    className="flex items-center gap-1 rounded-md bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-medium px-2.5 py-1.5 transition-colors flex-shrink-0"
                  >
                    {lookupLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Search className="h-3.5 w-3.5" />
                    }
                    {lookupLoading ? '' : 'Lookup'}
                  </button>
                </div>
                {lookupError && (
                  <p className="text-[11px] text-rose-400 mt-1">{lookupError}</p>
                )}
              </div>

              {/* Price info after lookup */}
              {lookupResult && (
                <div className="rounded-md bg-indigo-900/20 border border-indigo-800/40 px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Live price</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold font-mono text-slate-100">
                        {formatCurrency(lookupResult.price, lookupResult.currency)}
                      </span>
                      <span className={`text-[10px] font-medium ${lookupResult.changePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {lookupResult.changePercent24h >= 0 ? '+' : ''}{lookupResult.changePercent24h.toFixed(2)}%
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium uppercase tracking-wide">
                        {lookupResult.source}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity + Avg Cost */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    placeholder="e.g. 10"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Avg Cost <span className="text-slate-600">(optional)</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    placeholder="e.g. 148.50"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Value preview */}
              {previewValue !== null && (
                <div className="rounded-md bg-indigo-500/5 border border-indigo-500/20 px-2.5 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {previewQty} × {lookupResult ? formatCurrency(lookupResult.price, lookupResult.currency) : '—'}
                  </span>
                  <span className="text-sm font-semibold text-indigo-300 font-mono">
                    {formatCurrency(previewValue, lookupResult?.currency ?? 'USD')}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving || (assetClass !== 'CASH' && !lookupResult) || !qtyInput || (assetClass === 'CASH' && !nameInput.trim())}
              className="flex-1 rounded-md bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-medium py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Add Position'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`px-3 py-2 flex items-start gap-2 ${feedback.ok ? 'bg-emerald-900/20' : 'bg-rose-900/20'}`}>
          {feedback.ok
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          }
          <p className="text-xs text-slate-300">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Account Modal
// ---------------------------------------------------------------------------

interface AddAccountModalProps {
  onClose: () => void
  onCreated: () => void
}

function AddAccountModal({ onClose, onCreated }: AddAccountModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('BROKERAGE')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, currency }),
      })
      if (res.ok) { onCreated(); onClose() }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Add Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Account Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. My Savings Account"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Account Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="BANK">Bank</option>
              <option value="CRYPTO">Crypto</option>
              <option value="BROKERAGE">Brokerage</option>
              <option value="PENSION">Pension (פנסיה)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="USD">USD – US Dollar</option>
              <option value="ILS">ILS – Israeli Shekel ₪</option>
              <option value="EUR">EUR – Euro</option>
              <option value="GBP">GBP – British Pound</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} className="flex-1">Create Account</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete Account Confirmation Modal
// ---------------------------------------------------------------------------

interface DeleteAccountModalProps {
  account: AccountWithStats
  onClose: () => void
  onDeleted: () => void
}

function DeleteAccountModal({ account, onClose, onDeleted }: DeleteAccountModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to delete account')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Delete Account?</h2>
        <p className="text-sm text-slate-400 mb-1">
          This will remove <span className="text-slate-200 font-medium">{account.name}</span> from your dashboard.
        </p>
        <p className="text-xs text-slate-500 mb-5">
          Your transaction history is kept in the database — it just won&apos;t appear in the UI.
        </p>
        {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
        <div className="flex gap-3">
          <Button
            onClick={handleDelete}
            loading={loading}
            className="flex-1 bg-rose-700 hover:bg-rose-600"
          >
            Delete Account
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit Account Modal
// ---------------------------------------------------------------------------

interface EditAccountModalProps {
  account: AccountWithStats
  onClose: () => void
  onSaved: () => void
}

function EditAccountModal({ account, onClose, onSaved }: EditAccountModalProps) {
  const [name, setName] = useState(account.name)
  const [currency, setCurrency] = useState(account.currency)
  const [balance, setBalance] = useState(String(account.balance ?? 0))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          currency,
          balance: parseFloat(balance) || 0,
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
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Edit Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Account Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. My Savings Account"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="USD">USD – US Dollar</option>
              <option value="ILS">ILS – Israeli Shekel ₪</option>
              <option value="EUR">EUR – Euro</option>
              <option value="GBP">GBP – British Pound</option>
            </select>
          </div>
          {account.type === 'BANK' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Current Balance <span className="text-slate-500 font-normal">(manual override)</span>
              </label>
              <input
                type="number"
                step="any"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="e.g. 25000"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter your current bank balance. This is displayed as-is — not calculated from transactions.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CryptoSection
// Groups BTC editor + ETH editor + address config + purchase lots.
// Extracted so it can read BTCHoldingData (which has holdingId + currentValue)
// and pass them directly into PurchaseLotsSection.
// ---------------------------------------------------------------------------

interface CryptoSectionProps {
  account: AccountWithStats
  hasWatchOnlyAddress: boolean
  btcAddressMasked: string | null
  btcAddressType: string | null
  onRefresh: () => void
}

function CryptoSection({ account, hasWatchOnlyAddress, btcAddressMasked, btcAddressType, onRefresh }: CryptoSectionProps) {
  const [btcData, setBtcData] = useState<BTCHoldingData | null>(null)
  const [ethData, setEthData] = useState<ETHHoldingData | null>(null)

  // Keep a local copy of BTC/ETH data so PurchaseLotsSection can get holdingId + currentValue.
  // The editors themselves fetch independently; we just shadow the result here.
  useEffect(() => {
    fetch(`/api/accounts/${account.id}/btc-holding`)
      .then((r) => r.json()).then(setBtcData).catch(() => {})
    fetch(`/api/accounts/${account.id}/eth-holding`)
      .then((r) => r.json()).then(setEthData).catch(() => {})
  }, [account.id])

  function handleSaved() { onRefresh() }

  return (
    <>
      <BTCHoldingEditor
        accountId={account.id}
        isWatchOnly={!!(hasWatchOnlyAddress || process.env.BTC_ADDRESS)}
        onSaved={handleSaved}
      />
      {btcData?.holdingId && (
        <PurchaseLotsSection
          holdingId={btcData.holdingId}
          symbol="BTC"
          currentValueUsd={btcData.currentValue}
          onChanged={onRefresh}
        />
      )}

      <ETHHoldingEditor
        accountId={account.id}
        isWatchOnly={!!process.env.ETH_ADDRESS}
        onSaved={handleSaved}
      />
      {ethData?.holdingId && (
        <PurchaseLotsSection
          holdingId={ethData.holdingId}
          symbol="ETH"
          currentValueUsd={ethData.currentValue}
          onChanged={onRefresh}
        />
      )}

      <BTCAddressSection
        accountId={account.id}
        maskedAddress={btcAddressMasked}
        addressType={btcAddressType}
        onChanged={onRefresh}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

interface SyncState {
  loading: boolean
  result: string | null
  success: boolean | null
}

function AccountCard({ account, onRefresh, onDelete, onEdit }: { account: AccountWithStats; onRefresh: () => void; onDelete: () => void; onEdit: () => void }) {
  const colorClass = ACCOUNT_COLORS[account.type]
  const [syncing, setSyncing] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>({ loading: false, result: null, success: null })

  const meta = (account.metadata ?? {}) as Record<string, unknown>
  const hasWatchOnlyAddress = meta.hasWatchOnlyAddress as boolean | undefined
  const btcAddressMasked = meta.btcAddressMasked as string | null | undefined
  const btcAddressType = meta.btcAddressType as string | null | undefined
  // Determine sync label based on type and BTC mode
  const syncLabel =
    account.type === 'CRYPTO'
      ? hasWatchOnlyAddress ? 'Watch-Only Sync' : 'Price Sync (manual mode)'
      : account.type === 'BANK'
      ? 'Manual Entry'
      : account.type === 'PENSION'
      ? 'Manual Balance + S&P 500 Tracking'
      : 'CSV Import'

  const syncAvailable = account.type === 'CRYPTO' || account.type === 'PENSION'
  const syncNote =
    account.type === 'CRYPTO'
      ? hasWatchOnlyAddress
        ? 'Syncs real on-chain balance from blockchain.info, then updates value with live price.'
        : 'Fetches live BTC price from CoinGecko and updates value using your stored quantity.'
      : account.type === 'BANK'
      ? 'Enter your balance manually. Use CSV export from discountbank.co.il to import transactions.'
      : account.type === 'PENSION'
      ? 'Enter your current pension balance. The system will track S&P 500 performance (SPY) on your behalf via live price sync.'
      : 'Excellence Trade requires CSV export from the portal.'

  async function handleSync() {
    setSyncing(true)
    setSyncState({ loading: true, result: null, success: null })
    try {
      const adapterMap: Record<AccountType, string> = { BANK: 'bank', CRYPTO: 'crypto', BROKERAGE: 'brokerage', PENSION: 'pension' }
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, adapter: adapterMap[account.type] }),
      })
      const data = await res.json()
      setSyncState({
        loading: false,
        result: data.error ?? data.message ?? (data.success ? 'Synced successfully' : 'Sync failed'),
        success: data.success,
      })
      onRefresh()
    } catch {
      setSyncState({ loading: false, result: 'Network error', success: false })
    } finally {
      setSyncing(false)
    }
  }

  const displayValue = account.currency === 'ILS'
    ? formatCurrency(account.totalValue, 'ILS')
    : formatCurrency(account.totalValue)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${colorClass} flex items-center justify-center flex-shrink-0`}>
              {ACCOUNT_ICONS[account.type]}
            </div>
            <div>
              <CardTitle className="text-base">{account.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={account.type === 'BANK' ? 'success' : account.type === 'CRYPTO' ? 'warning' : account.type === 'PENSION' ? 'default' : 'default'}>
                  {account.type.charAt(0) + account.type.slice(1).toLowerCase()}
                </Badge>
                <span className="text-xs text-slate-500">{account.currency}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold text-slate-100 tabular-nums tracking-tight">{displayValue}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
              {account.holdingCount} position{account.holdingCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Integration status */}
        <div className={`rounded-lg p-3 mb-3 flex items-start gap-2.5 ${
          syncAvailable ? 'bg-emerald-900/20 border border-emerald-800/50' : 'bg-slate-800/50 border border-slate-700/50'
        }`}>
          {syncAvailable
            ? <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            : <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
          }
          <div>
            <p className={`text-xs font-medium ${syncAvailable ? 'text-emerald-300' : 'text-slate-300'}`}>
              {syncLabel}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{syncNote}</p>
          </div>
        </div>

        {/* BTC + ETH holdings editors + address configuration — crypto accounts only */}
        {account.type === 'CRYPTO' && (
          <CryptoSection
            account={account}
            hasWatchOnlyAddress={!!hasWatchOnlyAddress}
            btcAddressMasked={btcAddressMasked ?? null}
            btcAddressType={btcAddressType ?? null}
            onRefresh={onRefresh}
          />
        )}

        {/* Bank balance editor — bank accounts only */}
        {account.type === 'BANK' && (
          <BankBalanceSection
            accountId={account.id}
            currentBalance={account.balance}
            currency={account.currency}
            onSaved={onRefresh}
          />
        )}

        {/* Pension balance editor — pension accounts only */}
        {account.type === 'PENSION' && (
          <PensionBalanceSection
            accountId={account.id}
            currentBalance={account.balance}
            currency={account.currency}
            metadata={account.metadata as Record<string, unknown>}
            onSaved={onRefresh}
          />
        )}

        {/* Pension holdings breakdown — shows virtual tracked holding + live estimate */}
        {account.type === 'PENSION' && (
          <PensionHoldingsSection
            accountId={account.id}
            baseBalance={(account.metadata as Record<string, unknown>).pensionBaseBalance as number ?? account.balance}
            baseDatePrice={(account.metadata as Record<string, unknown>).pensionBaseDatePrice as number ?? 0}
            accountCurrency={account.currency}
          />
        )}

        {/* Brokerage holdings editor — brokerage accounts only */}
        {account.type === 'BROKERAGE' && (
          <>
            <BrokerageHoldingsSection
              accountId={account.id}
              onSaved={onRefresh}
            />
            <HoldingsPDFImport
              accountId={account.id}
              onImported={onRefresh}
            />
          </>
        )}

        {/* Last synced */}
        <div className="flex items-center justify-between text-xs text-slate-500 mt-3 mb-3">
          <span>
            Last synced:{' '}
            {account.lastSyncedAt
              ? formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })
              : 'Never'}
          </span>
          <span>Created {format(new Date(account.createdAt), 'MMM d, yyyy')}</span>
        </div>

        {/* Sync result */}
        {syncState.result && (
          <div className={`rounded-lg p-2.5 mb-3 flex items-start gap-2 ${
            syncState.success ? 'bg-emerald-900/20' : 'bg-rose-900/20'
          }`}>
            {syncState.success
              ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              : <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
            }
            <p className="text-xs text-slate-300">{syncState.result}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSync}
            loading={syncing}
            variant={syncAvailable ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {syncAvailable ? 'Sync Now' : 'Attempt Sync'}
          </Button>
          <Button
            onClick={onEdit}
            variant="outline"
            size="sm"
            className="gap-1.5 text-slate-400 border-slate-700 hover:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            onClick={onDelete}
            variant="outline"
            size="sm"
            className="gap-1.5 text-rose-400 border-rose-800/50 hover:bg-rose-900/20 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountWithStats[]>([])
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AccountWithStats | null>(null)
  const [editTarget, setEditTarget] = useState<AccountWithStats | null>(null)
  // Live ILS→USD rate fetched once on mount (USD per 1 ILS, e.g. 0.27)
  const [ilsToUsd, setIlsToUsd] = useState<number>(0.27)

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/accounts')
      if (res.ok) {
        const body = await res.json()
        setAccounts(Array.isArray(body.data) ? body.data : [])
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchAccounts()
    // Fetch live FX rate so the page-level USD total is accurate
    fetch('/api/fx-rate')
      .then((r) => r.json())
      .then((d) => { if (d.ilsToUsd > 0) setIlsToUsd(d.ilsToUsd) })
      .catch(() => { /* keep default 0.27 */ })
  }, [])

  // totalValue on each account is now correctly in the account's own currency
  // (server normalises holding currencies using the live rate). Convert ILS
  // accounts to USD here so we can display one combined USD total.
  const totalUsd = accounts.reduce((sum, a) => {
    const v = a.currency === 'ILS' ? a.totalValue * ilsToUsd : a.totalValue
    return sum + v
  }, 0)

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Accounts" />
      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Accounts</p>
            <p className="text-sm text-slate-400">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-slate-100 font-semibold tabular-nums">{formatCurrency(totalUsd)}</span>
              <span className="text-slate-600"> total</span>
            </p>
          </div>
          <Button onClick={() => setShowModal(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onRefresh={fetchAccounts}
              onDelete={() => setDeleteTarget(account)}
              onEdit={() => setEditTarget(account)}
            />
          ))}
        </div>

        {accounts.length === 0 && (
          <div className="text-center py-20">
            <Building2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">No accounts yet</p>
            <p className="text-sm text-slate-500 mb-6">Add your bank, brokerage, or crypto accounts to get started.</p>
            <Button onClick={() => setShowModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Your First Account
            </Button>
          </div>
        )}
      </main>

      {showModal && (
        <AddAccountModal onClose={() => setShowModal(false)} onCreated={fetchAccounts} />
      )}
      {deleteTarget && (
        <DeleteAccountModal
          account={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={fetchAccounts}
        />
      )}
      {editTarget && (
        <EditAccountModal
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchAccounts}
        />
      )}
    </div>
  )
}
