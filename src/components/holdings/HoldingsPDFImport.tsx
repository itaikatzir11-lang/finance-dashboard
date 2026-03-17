'use client'

/**
 * HoldingsPDFImport
 *
 * Dropzone for uploading an Excellence Trade "דו"ח תקופתי" (Periodic Report) PDF.
 * Sends the file to POST /api/holdings/import-pdf which parses the
 * "פירוט יתרות" table and upserts holdings for this account.
 *
 * The "פירוט תנועות" (Transactions) section in the PDF is deliberately ignored
 * by the server — only the balance snapshot is imported.
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImportResult {
  imported: number
  skipped: number
  holdings: Array<{ symbol: string; name: string; value: number; quantity: number }>
  warnings: string[]
}

interface HoldingsPDFImportProps {
  accountId: string
  onImported: () => void
}

type State =
  | { stage: 'idle' }
  | { stage: 'dragging' }
  | { stage: 'selected'; file: File }
  | { stage: 'uploading'; file: File }
  | { stage: 'success'; result: ImportResult }
  | { stage: 'error'; message: string }

export function HoldingsPDFImport({ accountId, onImported }: HoldingsPDFImportProps) {
  const [state, setState] = useState<State>({ stage: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  function selectFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setState({ stage: 'error', message: 'Only PDF files are supported.' })
      return
    }
    setState({ stage: 'selected', file })
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) selectFile(file)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState((s) => s.stage === 'idle' ? { stage: 'dragging' } : s)
  }, [])

  const onDragLeave = useCallback(() => {
    setState((s) => s.stage === 'dragging' ? { stage: 'idle' } : s)
  }, [])

  async function handleUpload() {
    if (state.stage !== 'selected') return
    const { file } = state
    setState({ stage: 'uploading', file })

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('accountId', accountId)

      const res = await fetch('/api/holdings/import-pdf', { method: 'POST', body: form })

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`
        try {
          const json = await res.json()
          errMsg = json.error ?? errMsg
        } catch { /* response wasn't JSON (e.g. HTML error page) */ }
        setState({ stage: 'error', message: errMsg })
        return
      }

      const json = await res.json()
      setState({ stage: 'success', result: json as ImportResult })
      onImported()
    } catch {
      setState({ stage: 'error', message: 'Network error — could not reach the server.' })
    }
  }

  function reset() {
    setState({ stage: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Idle / Dragging — dropzone ──────────────────────────────────────────────
  if (state.stage === 'idle' || state.stage === 'dragging') {
    const dragging = state.stage === 'dragging'
    return (
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          mt-3 rounded-xl border-2 border-dashed cursor-pointer
          flex flex-col items-center justify-center gap-2.5 px-4 py-8 text-center
          transition-all duration-200
          ${dragging
            ? 'border-indigo-400 bg-indigo-950/40 shadow-lg shadow-indigo-500/10 scale-[1.01]'
            : 'border-slate-700/70 bg-slate-900/40 hover:border-indigo-500/50 hover:bg-indigo-950/20 hover:shadow-md hover:shadow-indigo-500/5'}
        `}
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200
          ${dragging ? 'bg-indigo-600/30 shadow-sm shadow-indigo-500/30' : 'bg-slate-800/60'}`}>
          <Upload className={`h-5 w-5 transition-colors duration-200 ${dragging ? 'text-indigo-300' : 'text-slate-500'}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200 tracking-tight">
            Upload Excellence Trade PDF
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            דו&quot;ח תקופתי — drag & drop or click to browse
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f) }}
        />
      </div>
    )
  }

  // ── Selected — show filename + upload button ────────────────────────────────
  if (state.stage === 'selected') {
    return (
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3 flex items-center gap-3">
        <FileText className="h-5 w-5 text-indigo-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">{state.file.name}</p>
          <p className="text-xs text-slate-500">{(state.file.size / 1024).toFixed(0)} KB</p>
        </div>
        <Button size="sm" onClick={handleUpload} className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white border-transparent flex-shrink-0">
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
        <button onClick={reset} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ── Uploading ───────────────────────────────────────────────────────────────
  if (state.stage === 'uploading') {
    return (
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3 flex items-center gap-3">
        <Loader2 className="h-5 w-5 text-indigo-400 animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm text-slate-300">Parsing PDF…</p>
          <p className="text-xs text-slate-500 truncate">{state.file.name}</p>
        </div>
      </div>
    )
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (state.stage === 'success') {
    const { result } = state
    return (
      <div className="mt-3 rounded-lg border border-emerald-700/40 bg-emerald-900/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-300">
              Import complete — {result.imported} holding{result.imported !== 1 ? 's' : ''} updated
              {result.skipped > 0 && `, ${result.skipped} skipped`}
            </p>
          </div>
          <button onClick={reset} className="text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {result.holdings.length > 0 && (
          <div className="space-y-1 pt-1">
            {result.holdings.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-slate-300">{h.symbol || h.name}</span>
                <span>qty {h.quantity} · ₪{Math.round(h.value).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="pt-1 space-y-0.5">
            {result.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-400">{w}</p>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  return (
    <div className="mt-3 rounded-lg border border-rose-700/40 bg-rose-900/20 p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-rose-300">{state.message}</p>
      </div>
      <button onClick={reset} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
