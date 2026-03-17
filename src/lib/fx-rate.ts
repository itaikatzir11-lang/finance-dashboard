/**
 * Shared ILS → USD exchange rate helper.
 *
 * Priority:
 *   1. ILS_USD_RATE env var override (e.g. ILS_USD_RATE=0.27)
 *   2. Live rate from open.er-api.com (free, no key needed, cached 1 h)
 *   3. Live rate from api.exchangerate-api.com (fallback if primary fails)
 *   4. Hardcoded fallback 0.27
 *
 * Import this in any server-side route that needs ILS conversion.
 * Do NOT import in client components — env vars without NEXT_PUBLIC_ are server-only.
 */

let _cachedRate: number | null = null
let _cacheExpiry = 0
let _cachedAt: string | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const PRIMARY_URL = 'https://open.er-api.com/v6/latest/USD'
const FALLBACK_URL = 'https://api.exchangerate-api.com/v4/latest/USD'

async function fetchRateFromUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    // Both APIs return data.rates.ILS as "how many ILS per 1 USD" (e.g. 3.7).
    // We want "how many USD per 1 ILS" (e.g. 0.27) — the reciprocal.
    const ilsPerUsd: number = data?.rates?.ILS   // e.g. 3.7  — ILS you get for $1
    const usdPerIls = ilsPerUsd > 0 ? 1 / ilsPerUsd : 0  // e.g. 0.27 — USD you get for ₪1
    if (usdPerIls > 0) return usdPerIls
    return null
  } catch {
    return null
  }
}

export async function getIlsToUsd(): Promise<number> {
  // Env override always wins
  const envRate = process.env.ILS_USD_RATE
  if (envRate) {
    const parsed = parseFloat(envRate)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  // Return cached value if still fresh
  if (_cachedRate && Date.now() < _cacheExpiry) return _cachedRate

  // Try primary URL first
  const primary = await fetchRateFromUrl(PRIMARY_URL)
  if (primary) {
    _cachedRate = primary
    _cacheExpiry = Date.now() + CACHE_TTL_MS
    _cachedAt = new Date().toISOString()
    return _cachedRate
  }

  // Try fallback URL if primary failed
  const fallback = await fetchRateFromUrl(FALLBACK_URL)
  if (fallback) {
    _cachedRate = fallback
    _cacheExpiry = Date.now() + CACHE_TTL_MS
    _cachedAt = new Date().toISOString()
    return _cachedRate
  }

  // Both APIs failed — return hardcoded fallback
  return 0.27
}

/** Returns metadata about the cached rate for the /api/fx-rate endpoint. */
export function getFxRateMeta(): { rate: number | null; cachedAt: string | null; source: 'env' | 'live' | 'fallback' } {
  const envRate = process.env.ILS_USD_RATE
  if (envRate && Number.isFinite(parseFloat(envRate))) {
    return { rate: parseFloat(envRate), cachedAt: null, source: 'env' }
  }
  return {
    rate: _cachedRate,
    cachedAt: _cachedAt,
    source: _cachedRate ? 'live' : 'fallback',
  }
}
