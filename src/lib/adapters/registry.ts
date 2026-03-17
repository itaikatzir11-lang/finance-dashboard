/**
 * Adapter Registry
 *
 * Single source of truth for the status of every data source.
 * Used by /api/status and the Status page to show which integrations
 * are live, which are manual-only, and which are not yet configured.
 *
 * BTC address resolution order: env BTC_ADDRESS → DB metadata → manual mode.
 * The registry never stores or returns full addresses.
 */

import { maskBTCAddress } from '@/lib/btc-address'

export type SourceStatus = 'live' | 'mock' | 'manual' | 'error' | 'disconnected'

export interface DataSource {
  /** Stable ID used in API calls */
  id: string
  /** Display name */
  name: string
  type: 'bank' | 'crypto' | 'brokerage' | 'market'
  status: SourceStatus
  statusMessage: string
  /** Whether the necessary env vars / config are present */
  isConfigured: boolean
  capabilities: {
    /** Can fetch live data automatically */
    autoSync: boolean
    /** Supports CSV file import */
    csvImport: boolean
    /** Supports manual entry via UI */
    manualEntry: boolean
  }
  /** Non-secret config shown in the UI (e.g. truncated address) */
  visibleConfig?: Record<string, string | boolean>
  /** Next step to enable this source */
  enableHint?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function checkBTCStatus(address: string): Promise<{ status: SourceStatus; message: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(
      `https://blockchain.info/rawaddr/${address}?limit=0`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    ).finally(() => clearTimeout(timeout))

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    return { status: 'live', message: 'Connected – blockchain.info returning real on-chain balance.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: `blockchain.info unreachable: ${msg}` }
  }
}

async function checkETHStatus(address: string): Promise<{ status: SourceStatus; message: string }> {
  try {
    const apiKey = process.env.ETHPLORER_API_KEY ?? 'freekey'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(
      `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${apiKey}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    ).finally(() => clearTimeout(timeout))

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    return {
      status: 'live',
      message: `Connected – Ethplorer returning real on-chain balance. API key: ${apiKey === 'freekey' ? 'free tier' : 'custom'}.`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: `Ethplorer unreachable: ${msg}` }
  }
}

async function checkMarketDataStatus(): Promise<{ status: SourceStatus; message: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch('https://api.coingecko.com/api/v3/ping', {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (res.ok) {
      return {
        status: 'live',
        message: 'CoinGecko reachable. Stocks via Yahoo Finance (no key needed). Prices refresh on sync.',
      }
    }
    throw new Error(`HTTP ${res.status}`)
  } catch {
    return {
      status: 'mock',
      message: 'Market data APIs unreachable. Showing cached / mock prices. Will retry on next sync.',
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the live status of all data sources.
 *
 * @param opts.btcAddressFromDb - Full BTC address read from DB by the caller.
 *   Env var BTC_ADDRESS takes priority. The caller is responsible for reading
 *   the DB so the registry stays free of direct Prisma imports.
 *   The address is used only to ping the API — it is never stored or returned.
 */
export async function getDataSourceStatuses(opts?: {
  btcAddressFromDb?: string | null
}): Promise<DataSource[]> {
  // env always takes priority over DB
  const btcAddress = process.env.BTC_ADDRESS ?? opts?.btcAddressFromDb ?? undefined
  const ethAddress = process.env.ETH_ADDRESS

  // Run all network checks concurrently
  const [btcCheck, ethCheck, marketCheck] = await Promise.all([
    btcAddress ? checkBTCStatus(btcAddress) : Promise.resolve(null),
    ethAddress ? checkETHStatus(ethAddress) : Promise.resolve(null),
    checkMarketDataStatus(),
  ])

  // Track where the address came from for the status message
  const btcSource = process.env.BTC_ADDRESS ? 'env' : (opts?.btcAddressFromDb ? 'db' : null)

  const sources: DataSource[] = [
    // -----------------------------------------------------------------------
    // Discount Bank — manual balance entry + CSV import
    // -----------------------------------------------------------------------
    {
      id: 'discount-bank',
      name: 'Discount Bank',
      type: 'bank' as const,
      status: 'manual' as const,
      statusMessage:
        'Manual mode: update your balance directly on the Accounts page. ' +
        'Export account activity from discountbank.co.il and import via CSV to sync transactions.',
      isConfigured: true,
      capabilities: { autoSync: false, csvImport: true, manualEntry: true },
      enableHint:
        'Log in to discountbank.co.il → Account Activity → Export CSV → ' +
        'upload on the Transactions page to import your transaction history.',
    },

    // -----------------------------------------------------------------------
    // Bitcoin
    //
    // Two modes:
    //   manual    – quantity stored in DB, price fetched live. DEFAULT.
    //   watch-only – address configured (via app UI or env) → syncs on-chain balance.
    // -----------------------------------------------------------------------
    {
      id: 'bitcoin',
      name: 'Bitcoin',
      type: 'crypto',
      status: btcAddress ? (btcCheck?.status ?? 'error') : 'manual',
      statusMessage: btcAddress
        ? `${btcCheck?.message ?? 'Status unknown'} Address configured via ${btcSource === 'env' ? '.env' : 'app UI'}.`
        : 'Manual mode: BTC quantity is stored locally, live price is fetched from CoinGecko. ' +
          'Value = quantity × live price. No wallet address required.',
      isConfigured: true, // always — manual mode works with no setup
      capabilities: { autoSync: true, csvImport: false, manualEntry: true },
      visibleConfig: btcAddress
        ? {
            mode: 'watch-only',
            address: maskBTCAddress(btcAddress),
            configuredVia: btcSource === 'env' ? '.env (overrides DB)' : 'app UI',
          }
        : { mode: 'manual', priceSource: 'CoinGecko (live)' },
      enableHint: btcAddress
        ? undefined
        : 'Optional: configure a watch-only BTC address from the Accounts page to sync real on-chain balance.',
    },

    // -----------------------------------------------------------------------
    // Ethereum
    //
    // Fully optional. Only shown as active when ETH_ADDRESS is configured.
    // If unused, status is 'disconnected' and it does not affect the dashboard.
    // -----------------------------------------------------------------------
    {
      id: 'ethereum',
      name: 'Ethereum',
      type: 'crypto',
      status: ethAddress ? (ethCheck?.status ?? 'error') : 'disconnected',
      statusMessage: ethAddress
        ? (ethCheck?.message ?? 'Status unknown')
        : 'Not configured. Set ETH_ADDRESS in .env to enable Ethereum watch-only balance sync.',
      isConfigured: !!ethAddress,
      capabilities: {
        autoSync: !!ethAddress,
        csvImport: false,
        manualEntry: true,
      },
      visibleConfig: ethAddress
        ? { mode: 'watch-only', address: ethAddress.slice(0, 8) + '...' + ethAddress.slice(-6) }
        : undefined,
      enableHint: 'Set ETH_ADDRESS=0x... in .env and restart. Optionally set ETHPLORER_API_KEY for higher rate limits.',
    },

    // -----------------------------------------------------------------------
    // Excellence Trade
    // -----------------------------------------------------------------------
    {
      id: 'excellence-trade',
      name: 'Excellence Trade',
      type: 'brokerage',
      status: 'manual',
      statusMessage:
        'No documented public API. Holdings and transactions must be imported via CSV or entered manually.',
      isConfigured: false,
      capabilities: { autoSync: false, csvImport: true, manualEntry: true },
      enableHint:
        'Log in to Excellence Trade portal → Reports → Export transaction history as CSV → Import in Transactions page.',
    },

    // -----------------------------------------------------------------------
    // Pension — manual balance, S&P 500 (SPY) price tracking
    // -----------------------------------------------------------------------
    {
      id: 'pension',
      name: 'Pension (פנסיה)',
      type: 'brokerage' as const,
      status: 'manual' as const,
      statusMessage:
        'Manual mode: enter your pension balance on the Accounts page. ' +
        'The system creates a virtual SPY (S&P 500) holding so price sync ' +
        'tracks your pension growth automatically.',
      isConfigured: true,
      capabilities: { autoSync: true, csvImport: false, manualEntry: true },
      visibleConfig: { tracking: 'S&P 500 via SPY (Yahoo Finance)', currency: 'ILS' },
      enableHint:
        'Add a Pension account on the Accounts page, enter your balance, ' +
        'and run Sync Now to link it to live S&P 500 prices.',
    },

    // -----------------------------------------------------------------------
    // Market Data
    // -----------------------------------------------------------------------
    {
      id: 'market-data',
      name: 'Market Data',
      type: 'market',
      status: marketCheck.status,
      statusMessage: marketCheck.message,
      isConfigured: true,
      capabilities: { autoSync: true, csvImport: false, manualEntry: false },
      visibleConfig: {
        stocks: 'Yahoo Finance (free, no key)',
        crypto: 'CoinGecko (free tier)',
      },
      enableHint: undefined,
    },
  ]

  return sources
}

/** Quick summary: how many sources are in each state. */
export function summarizeStatuses(sources: DataSource[]): {
  live: number
  manual: number
  mock: number
  error: number
} {
  return sources.reduce(
    (acc, s) => {
      // disconnected = not in use, don't count in summary
      if (s.status === 'disconnected') return acc
      const key = s.status as keyof typeof acc
      if (key in acc) acc[key] = (acc[key] ?? 0) + 1
      return acc
    },
    { live: 0, manual: 0, mock: 0, error: 0 }
  )
}
