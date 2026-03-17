'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Clock } from 'lucide-react'
import { formatCurrency, getChangeColor, formatPercent } from '@/lib/utils'
import type { NetWorthSummary } from '@/types'
import { format } from 'date-fns'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const [netWorth, setNetWorth] = useState<NetWorthSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [now, setNow] = useState<Date>(new Date())

  useEffect(() => {
    setLastUpdated(new Date())
    fetchNetWorth()
  }, [])

  // Keep clock ticking so the "updated X ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  async function fetchNetWorth() {
    try {
      const res = await fetch('/api/net-worth')
      if (res.ok) {
        const data = await res.json()
        setNetWorth(data)
        setLastUpdated(new Date())
      }
    } catch {
      // Silent fail
    }
  }

  async function handleSyncAll() {
    setSyncing(true)
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter: 'all' }),
      })
      // Reload so all dashboard components pick up fresh prices + new snapshot
      window.location.reload()
    } catch {
      // Silent fail — at least refresh net worth display
      await fetchNetWorth()
      setSyncing(false)
    }
  }

  const changeColor = netWorth ? getChangeColor(netWorth.dailyChange) : 'text-slate-500'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.05] backdrop-blur-2xl px-6 lg:px-8" style={{ backgroundColor: 'var(--header-bg)' }}>
      {/* Page title */}
      <div>
        <h1 className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest">{title}</h1>
        <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          <span>
            {lastUpdated
              ? (() => {
                  const diffMs = now.getTime() - lastUpdated.getTime()
                  const diffMin = Math.floor(diffMs / 60_000)
                  if (diffMin < 1) return 'Updated just now'
                  if (diffMin === 1) return 'Updated 1 min ago'
                  if (diffMin < 60) return `Updated ${diffMin} min ago`
                  return `Updated at ${format(lastUpdated, 'HH:mm')}`
                })()
              : '—'}
          </span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-5">
        {netWorth && (
          <div className="text-right hidden sm:block">
            <div className="text-xl font-semibold text-white tabular-nums tracking-tighter">
              {formatCurrency(netWorth.total)}
            </div>
            <div className={`text-[11px] font-medium ${changeColor} flex items-center justify-end gap-1`}>
              <span className="text-[9px]">{netWorth.dailyChange >= 0 ? '▲' : '▼'}</span>
              <span>{formatCurrency(Math.abs(netWorth.dailyChange))}</span>
              <span>({formatPercent(netWorth.dailyChangePercent)})</span>
              <span className="text-slate-600 font-normal">today</span>
            </div>
          </div>
        )}

        <button
          onClick={handleSyncAll}
          disabled={syncing}
          title="Refresh all prices"
          className="h-8 w-8 flex items-center justify-center rounded-lg ring-1 ring-white/[0.08] text-slate-500 hover:text-white hover:ring-indigo-500/40 hover:bg-indigo-500/[0.06] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  )
}
