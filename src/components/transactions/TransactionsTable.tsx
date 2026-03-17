'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge, BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { TransactionWithRelations, TransactionType, PaginatedResponse, AccountsResponse } from '@/types'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Trash2, Pencil, Search, X } from 'lucide-react'

const TX_TYPE_CONFIG: Record<TransactionType, { label: string; variant: BadgeVariant; color: string }> = {
  BUY:        { label: 'Buy',        variant: 'default',     color: 'text-indigo-400' },
  SELL:       { label: 'Sell',       variant: 'warning',     color: 'text-amber-400' },
  DEPOSIT:    { label: 'Deposit',    variant: 'success',     color: 'text-emerald-400' },
  WITHDRAWAL: { label: 'Withdrawal', variant: 'destructive', color: 'text-rose-400' },
  DIVIDEND:   { label: 'Dividend',   variant: 'success',     color: 'text-emerald-400' },
  FEE:        { label: 'Fee',        variant: 'secondary',   color: 'text-slate-400' },
  TRANSFER:   { label: 'Transfer',   variant: 'outline',     color: 'text-slate-300' },
}

const TX_TYPES: TransactionType[] = ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'TRANSFER']

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  tx: TransactionWithRelations
  onClose: () => void
  onSaved: () => void
}

function EditTransactionModal({ tx, onClose, onSaved }: EditModalProps) {
  const [type, setType] = useState<TransactionType>(tx.type)
  const [symbol, setSymbol] = useState(tx.symbol ?? '')
  const [quantity, setQuantity] = useState(tx.quantity != null ? String(tx.quantity) : '')
  const [price, setPrice] = useState(tx.price != null ? String(tx.price) : '')
  const [amount, setAmount] = useState(String(tx.amount))
  const [description, setDescription] = useState(tx.description ?? '')
  const [date, setDate] = useState(format(new Date(tx.date), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!amount) { setError('Amount is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          symbol: symbol || null,
          quantity: quantity !== '' ? parseFloat(quantity) : null,
          price: price !== '' ? parseFloat(price) : null,
          amount: parseFloat(amount),
          description: description || null,
          date,
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
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Edit Transaction</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as TransactionType)} className={inputCls}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{TX_TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Symbol <span className="text-slate-600">(optional)</span></label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. -9500" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Quantity <span className="text-slate-600">(optional)</span></label>
            <input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 10" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price per unit <span className="text-slate-600">(optional)</span></label>
            <input type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 175.00" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description <span className="text-slate-600">(optional)</span></label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Quarterly dividend" className={inputCls} />
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

// ── Table ─────────────────────────────────────────────────────────────────────

const selectCls = 'rounded-lg border border-slate-700 bg-slate-800 text-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500'

interface Props {
  accountId?: string
  symbol?: string
}

export function TransactionsTable({ accountId, symbol }: Props) {
  const [data, setData] = useState<PaginatedResponse<TransactionWithRelations> | null>(null)
  const [accountMap, setAccountMap] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<TransactionWithRelations | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((res: AccountsResponse) => {
        const map: Record<string, string> = {}
        if (Array.isArray(res.data)) {
          for (const a of res.data) map[a.id] = a.name
        }
        setAccountMap(map)
      })
      .catch(() => {})
  }, [])

  const fetchTransactions = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '25' })
      if (accountId)  params.set('accountId', accountId)
      if (symbol)     params.set('symbol', symbol)
      if (search)     params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (dateFrom)   params.set('dateFrom', dateFrom)
      if (dateTo)     params.set('dateTo', dateTo)

      const res = await fetch(`/api/transactions?${params}`)
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [accountId, symbol, search, typeFilter, dateFrom, dateTo])

  // Reset to page 1 when any filter changes
  useEffect(() => { setPage(1) }, [search, typeFilter, dateFrom, dateTo])

  useEffect(() => { fetchTransactions(page) }, [fetchTransactions, page])

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) fetchTransactions(page)
    } catch { /* silent */ }
    finally { setDeletingId(null) }
  }

  function clearFilters() {
    setSearch('')
    setTypeFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = !!(search || typeFilter || dateFrom || dateTo)
  const transactions = data?.data ?? []

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or description…"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TransactionType | '')}
          className={selectCls}
        >
          <option value="">All types</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>{TX_TYPE_CONFIG[t].label}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
          className={selectCls}
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="To date"
          className={selectCls}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500 py-12">
                  {hasFilters ? 'No transactions match your filters' : 'No transactions found'}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => {
                const config = TX_TYPE_CONFIG[tx.type]
                const isPositive = tx.amount > 0
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-slate-400 text-xs whitespace-nowrap">
                      {format(new Date(tx.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-slate-300 text-xs max-w-[130px] truncate">
                      {accountMap[tx.accountId] ?? tx.account?.name ?? tx.accountId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {tx.symbol
                        ? <span className="font-semibold text-slate-100">{tx.symbol}</span>
                        : <span className="text-slate-500">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-300">
                      {tx.quantity != null
                        ? tx.quantity < 1 ? tx.quantity.toFixed(4) : tx.quantity.toFixed(2)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-400">
                      {tx.price != null ? formatCurrency(tx.price, tx.currency) : '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${isPositive ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {isPositive ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {tx.source === 'CSV_IMPORT' ? 'CSV' : tx.source === 'API' ? 'API' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditTarget(tx)}
                          className="text-slate-600 hover:text-indigo-400 transition-colors"
                          title="Edit transaction"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          className="text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-40"
                          title="Delete transaction"
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
      </div>

      {/* ── Pagination ── */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-1 px-1">
          <p className="text-sm text-slate-400">
            Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, data.total)} of {data.total} transactions
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-400">{page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <EditTransactionModal
          tx={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => fetchTransactions(page)}
        />
      )}
    </div>
  )
}
