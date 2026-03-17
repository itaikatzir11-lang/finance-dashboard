'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Database } from 'lucide-react'

export function DBSetupBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => {
        const summary = data?.summary
        if (summary && summary.live === 0) {
          setVisible(true)
        }
      })
      .catch(() => {})
  }, [dismissed])

  if (!visible || dismissed) return null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm">
      <Database className="h-4 w-4 text-amber-400 flex-shrink-0" />
      <p className="flex-1 text-amber-200">
        <span className="font-medium">Showing sample data</span> — database not connected.{' '}
        Set <code className="rounded bg-amber-900/40 px-1 text-amber-300">DATABASE_URL</code> in your{' '}
        <code className="rounded bg-amber-900/40 px-1 text-amber-300">.env</code> file and run{' '}
        <code className="rounded bg-amber-900/40 px-1 text-amber-300">npm run db:push</code> to use real data.{' '}
        <Link href="/status" className="underline text-amber-300 hover:text-amber-200">
          View connections →
        </Link>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-400 transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
