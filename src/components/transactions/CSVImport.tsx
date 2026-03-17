'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import type { AccountWithStats, AccountsResponse, ImportResult, ParsedTransaction, RowError } from '@/types'

const BANK_COLUMNS = ['תאריך / Date', 'פרטי פעולה / Details', 'חובה / Debit', 'זכות / Credit', 'יתרה / Balance']
const BROKERAGE_COLUMNS = ['Date', 'Symbol', 'Type', 'Quantity', 'Price', 'Amount', 'Description']

export function CSVImport() {
  const [accounts, setAccounts] = useState<AccountWithStats[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedTransaction[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const isBank = selectedAccount?.type === 'BANK'

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((res: AccountsResponse) => {
        const list = Array.isArray(res.data) ? res.data : []
        setAccounts(list)
        if (list.length > 0) setSelectedAccountId(list[0].id)
      })
      .catch(() => {})
  }, [])

  async function parseFileForPreview(f: File, accountType?: string) {
    const text = await f.text()
    try {
      if (accountType === 'BANK') {
        const { DiscountBankAdapter } = await import('@/lib/adapters/discount-bank')
        const adapter = new DiscountBankAdapter({ accountId: selectedAccountId })
        const { transactions } = adapter.parseCSV(text)
        setPreview(transactions.slice(0, 10))
      } else {
        const { ExcellenceTradeAdapter } = await import('@/lib/adapters/excellence-trade')
        const adapter = new ExcellenceTradeAdapter()
        const { transactions } = adapter.parseCSV(text)
        setPreview(transactions.slice(0, 10))
      }
    } catch {
      setPreview([])
    }
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      setFileError(`"${f.name}" is not a CSV file. Please select a .csv file.`)
      setFile(null)
      setPreview([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFileError(null)
    setFile(f)
    setResult(null)
    parseFileForPreview(f, selectedAccount?.type)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  async function handleImport() {
    if (!file || !selectedAccountId) return
    setImporting(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('accountId', selectedAccountId)

      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        body: formData,
      })

      const data: ImportResult = await res.json()
      setResult(data)

      if (data.success) {
        setFile(null)
        setPreview([])
      }
    } catch {
      setResult({ success: false, imported: 0, skipped: 0, errors: ['Network error. Please try again.'], rowErrors: [] })
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setFile(null)
    setFileError(null)
    setPreview([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Instructions */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">CSV Format</h3>
        {isBank ? (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Export your transaction history from Discount Bank (דיסקונט) and upload it below.
              The CSV should include these columns:
            </p>
            <div className="flex flex-wrap gap-2">
              {BANK_COLUMNS.map((col) => (
                <Badge key={col} variant="outline" className="font-mono text-[10px]">{col}</Badge>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              In Discount Bank online: פעולות → יצוא לאקסל/CSV
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Export your transaction history from Excellence Trade (אקסלנס) and upload it below.
              Your CSV should have these columns (English or Hebrew):
            </p>
            <div className="flex flex-wrap gap-2">
              {BROKERAGE_COLUMNS.map((col) => (
                <Badge key={col} variant="outline" className="font-mono text-[10px]">{col}</Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Account selector */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Import to Account
        </label>
        <select
          value={selectedAccountId}
          onChange={(e) => {
            const newId = e.target.value
            setSelectedAccountId(newId)
            const newAccount = accounts.find((a) => a.id === newId)
            if (file) {
              setPreview([])
              parseFileForPreview(file, newAccount?.type)
            }
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select account...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      {!file ? (
        <>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed
              cursor-pointer transition-all py-12 px-6
              ${fileError
                ? 'border-rose-600 bg-rose-500/5'
                : dragOver
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-700 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/30'
              }
            `}
          >
            <Upload className={`h-10 w-10 mb-3 ${fileError ? 'text-rose-500' : dragOver ? 'text-indigo-400' : 'text-slate-600'}`} />
            <p className="text-sm font-medium text-slate-300 mb-1">
              Drop your CSV file here, or click to browse
            </p>
            <p className="text-xs text-slate-500">Supports .csv files up to 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
          {fileError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-700 bg-rose-900/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
              <p className="text-xs text-rose-300">{fileError}</p>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-indigo-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                  {preview.length > 0 && ` · ${preview.length}+ transactions detected`}
                </p>
              </div>
            </div>
            <button onClick={reset} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50">
                    {['Date', 'Symbol', 'Type', 'Qty', 'Price', 'Amount'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((tx, i) => (
                    <tr key={i} className="border-b border-slate-800/50 last:border-0">
                      <td className="px-3 py-1.5 text-slate-400">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-slate-200">{tx.symbol || '—'}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[9px] px-1">{tx.type}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-slate-300">{tx.quantity || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-400">{tx.price ? formatCurrency(tx.price) : '—'}</td>
                      <td className={`px-3 py-1.5 font-medium ${tx.amount >= 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length === 10 && (
                <p className="text-center text-xs text-slate-500 py-2">
                  Showing first 10 rows — all rows will be imported
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button
              onClick={handleImport}
              loading={importing}
              disabled={!selectedAccountId || importing}
              className="flex-1"
            >
              Import {preview.length > 0 ? `~${preview.length}+` : ''} Transactions
            </Button>
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          result.success
            ? 'border-emerald-700 bg-emerald-900/20'
            : 'border-rose-700 bg-rose-900/20'
        }`}>
          {result.success
            ? <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
          }
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${result.success ? 'text-emerald-300' : 'text-rose-300'}`}>
              {result.success
                ? `Successfully imported ${result.imported} transaction${result.imported !== 1 ? 's' : ''}`
                : 'Import failed'}
            </p>

            {/* Import summary counts */}
            <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
              {result.imported > 0 && (
                <span className="text-emerald-400">{result.imported} imported</span>
              )}
              {result.skipped > 0 && (
                <span className="text-slate-500">{result.skipped} skipped</span>
              )}
              {(result.rowErrors ?? []).length > 0 && (
                <span className="text-amber-400">
                  {result.rowErrors.length} row{result.rowErrors.length !== 1 ? 's' : ''} failed
                </span>
              )}
            </div>

            {/* General warnings / system notes */}
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs text-slate-400 font-mono leading-relaxed">{err}</li>
                ))}
              </ul>
            )}

            {/* Per-row failures table */}
            {(result.rowErrors ?? []).length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-amber-400 mb-1.5">
                  Failed rows — fix these in your CSV and re-import:
                </p>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-950/60 sticky top-0">
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium w-16">Row</th>
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.rowErrors as RowError[]).map((re, i) => (
                        <tr key={i} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-3 py-1.5 tabular-nums text-slate-500 font-mono">{re.row}</td>
                          <td className="px-3 py-1.5 text-slate-400">{re.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
