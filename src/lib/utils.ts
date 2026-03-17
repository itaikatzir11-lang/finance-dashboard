import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as currency.
 * Defaults to USD. Pass currency='ILS' for ₪ formatting.
 *
 * ILS uses LTR-safe notation: ₪18,786 or -₪18,786
 * (avoids the invisible RTL marker that Hebrew locale produces).
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  if (currency === 'ILS') {
    const abs = Math.abs(value)
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(abs)
    return value < 0 ? `-₪${formatted}` : `₪${formatted}`
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format a percentage value with sign and 2 decimal places.
 * e.g. 2.34 → "+2.34%", -1.5 → "-1.50%"
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * Format a large number in compact notation.
 * e.g. 1234567 → "1.2M"
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Returns a Tailwind CSS text color class based on a positive/negative value.
 * Positive → emerald-400, Negative → rose-400, Zero → slate-400
 */
export function getChangeColor(value: number): string {
  if (value > 0) return 'text-emerald-400'
  if (value < 0) return 'text-rose-400'
  return 'text-slate-400'
}

/**
 * Returns a Tailwind CSS background color class for badges.
 */
export function getChangeBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-400/10 text-emerald-400'
  if (value < 0) return 'bg-rose-400/10 text-rose-400'
  return 'bg-slate-400/10 text-slate-400'
}

/**
 * Convert ILS to USD using a fixed approximate rate.
 * @deprecated Use the useFxRate() hook in client components or getIlsToUsd()
 *   in server/API routes for a live rate. This function is kept only for
 *   legacy call sites that cannot easily be migrated.
 */
export function ilsToUsd(ils: number): number {
  const ILS_USD_RATE = 0.27 // approximate fallback
  return ils * ILS_USD_RATE
}

/**
 * Capitalize first letter of a string.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, maxLength: number = 20): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Generate a color for an asset class.
 */
export function getAssetClassColor(assetClass: string): string {
  const colors: Record<string, string> = {
    STOCK:     '#6366f1',
    ETF:       '#8b5cf6',
    STOCK_ETF: '#6366f1',
    CRYPTO:    '#f59e0b',
    CASH:      '#10b981',
    BOND:      '#3b82f6',
    OTHER:     '#64748b',
  }
  return colors[assetClass] ?? '#64748b'
}

/**
 * Get a color for an account type.
 */
export function getAccountTypeColor(accountType: string): string {
  const colors: Record<string, string> = {
    BANK: '#10b981',
    CRYPTO: '#f59e0b',
    BROKERAGE: '#6366f1',
  }
  return colors[accountType] ?? '#64748b'
}

/**
 * Safe JSON parse - returns defaultValue if parsing fails.
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return defaultValue
  }
}
