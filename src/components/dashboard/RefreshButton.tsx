'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter: 'all' }),
      })
      window.location.reload()
    } catch {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      title="Refresh all prices"
      className="fixed bottom-6 right-6 z-50 h-12 w-12 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-xl transition-colors"
    >
      <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
    </button>
  )
}
