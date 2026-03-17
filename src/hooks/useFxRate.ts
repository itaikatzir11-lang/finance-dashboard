'use client'

import { useEffect, useState } from 'react'

const FALLBACK_ILS_TO_USD = 0.27

/**
 * Module-level cache — all component instances share a single network fetch.
 * The /api/fx-rate response is cached for 1 hour server-side, so repeated
 * client calls hit the server cache and return immediately.
 */
let _cachedRate: number | null = null
let _fetchPromise: Promise<number> | null = null

function getRate(): Promise<number> {
  if (_cachedRate !== null) return Promise.resolve(_cachedRate)
  if (!_fetchPromise) {
    _fetchPromise = fetch('/api/fx-rate')
      .then((r) => r.json())
      .then((d: { ilsToUsd?: number }) => {
        const rate =
          typeof d.ilsToUsd === 'number' && d.ilsToUsd > 0
            ? d.ilsToUsd
            : FALLBACK_ILS_TO_USD
        _cachedRate = rate
        return rate
      })
      .catch(() => FALLBACK_ILS_TO_USD)
  }
  return _fetchPromise
}

/**
 * Hook that provides the live ILS ↔ USD exchange rate.
 *
 * - All component instances share one HTTP request (module-level cache).
 * - Starts with the hardcoded fallback (0.27) and updates once the fetch resolves.
 * - `usdToIls` is the reciprocal — use it to convert USD amounts to ILS for display.
 *
 * @example
 *   const { usdToIls } = useFxRate()
 *   formatCurrency(holding.currentValue * usdToIls, 'ILS')
 */
export function useFxRate() {
  const [ilsToUsd, setIlsToUsd] = useState(FALLBACK_ILS_TO_USD)

  useEffect(() => {
    getRate().then(setIlsToUsd)
  }, [])

  return {
    ilsToUsd,
    /** Multiply a USD amount by this to get ILS. e.g. $100 → ₪370 */
    usdToIls: 1 / ilsToUsd,
  }
}
