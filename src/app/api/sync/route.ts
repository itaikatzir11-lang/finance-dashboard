/**
 * POST /api/sync
 *
 * Triggers a data sync for one or all adapters.
 * Body: { accountId?: string, adapter: 'crypto' | 'bank' | 'brokerage' | 'all' }
 *
 * BTC operates in two modes:
 *   manual mode    (default) – no address needed. Fetches live price from CoinGecko
 *                              and updates currentPrice/currentValue using stored quantity.
 *   watch-only mode          – set BTC_ADDRESS in .env. Syncs real on-chain balance,
 *                              then multiplies by live price.
 *
 * ETH is fully optional. Only synced when ETH_ADDRESS is configured.
 *
 * Never silently returns fake data — errors are surfaced clearly.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SyncResult } from '@/types'
import { getIlsToUsd } from '@/lib/fx-rate'

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting — 5-minute cooldown between sync calls
// Each sync fans out to Yahoo Finance, CoinGecko, and blockchain.info.
// Without a cooldown, repeated button clicks will exhaust all three free-tier
// rate limits simultaneously.
//
// The timestamp is stored in UserSettings (DB) so the cooldown survives
// serverless cold starts — module-level variables reset to 0 on every new
// function instance.
// ─────────────────────────────────────────────────────────────────────────────
const SYNC_COOLDOWN_MS = 5 * 60 * 1000

async function snapshotNetWorth() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const ILS_USD = await getIlsToUsd()
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: { holdings: true },
    })

    // Canonical breakdown keys — must match NetWorthBreakdown in types/index.ts
    // and the POST /api/snapshots route so history chart data is consistent.
    let cash = 0          // BANK accounts + brokerage CASH-class holdings
    let crypto = 0        // CRYPTO accounts
    let capitalMarket = 0 // BROKERAGE invested holdings (non-CASH)
    let pension = 0       // PENSION accounts

    for (const acc of accounts) {
      const toUsd = (val: number, cur: string) =>
        cur === 'ILS' ? val * ILS_USD : val

      if (acc.type === 'BANK') {
        cash += toUsd(acc.balance, acc.currency)
      } else if (acc.type === 'CRYPTO') {
        const holdingsValue = acc.holdings.reduce(
          (sum, h) => h.quantity > 0 ? sum + toUsd(h.currentValue, h.currency) : sum, 0
        )
        crypto += holdingsValue > 0
          ? holdingsValue
          : toUsd(acc.balance, acc.currency)
      } else if (acc.type === 'BROKERAGE') {
        for (const h of acc.holdings) {
          if (h.quantity <= 0) continue
          const usdVal = toUsd(h.currentValue, h.currency)
          if (h.assetClass === 'CASH') {
            cash += usdVal
          } else {
            capitalMarket += usdVal
          }
        }
        if (acc.holdings.length === 0) {
          cash += toUsd(acc.balance, acc.currency)
        }
      } else if (acc.type === 'PENSION') {
        const holdingsValue = acc.holdings.reduce(
          (sum, h) => h.quantity > 0 ? sum + toUsd(h.currentValue, h.currency) : sum, 0
        )
        pension += holdingsValue > 0
          ? holdingsValue
          : toUsd(acc.balance, acc.currency)
      }
    }

    await prisma.netWorthSnapshot.create({
      data: {
        totalValue: cash + crypto + capitalMarket + pension,
        breakdown: { cash, crypto, capitalMarket, pension },
      },
    })
  } catch {
    // DB not available — snapshot skipped
  }
}

/**
 * Sync all stock and ETF holding prices.
 * Fetches live prices from Yahoo Finance and updates currentPrice/currentValue in DB.
 * Also persists prices to PriceCache to avoid repeated API calls.
 */
async function syncStocks(): Promise<SyncResult> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { updatePriceCache } = await import('@/lib/market-data')

    // Get all non-crypto, non-cash holdings
    const holdings = await prisma.holding.findMany({
      where: {
        assetClass: { in: ['STOCK', 'ETF', 'BOND'] },
        account: { isActive: true },
      },
    })

    if (holdings.length === 0) {
      return { success: true, message: 'No stock/ETF holdings to sync' }
    }

    const symbols = [...new Set(holdings.map((h) => h.symbol))]
    const priceResults = await updatePriceCache(symbols, prisma)
    const priceMap = Object.fromEntries(priceResults.map((p) => [p.symbol, p]))

    let updated = 0
    for (const holding of holdings) {
      const priceData = priceMap[holding.symbol]
      if (!priceData || priceData.source === 'mock') continue

      const newValue = priceData.price * holding.quantity
      await prisma.holding.update({
        where: { id: holding.id },
        data: {
          currentPrice: priceData.price,
          currentValue: newValue,
          dailyChangePercent: priceData.changePercent24h,
          // Resolve company name if holding still uses symbol as name
          ...(priceData.name && holding.name === holding.symbol ? { name: priceData.name } : {}),
          updatedAt: new Date(),
        },
      })
      updated++
    }

    const sources = [...new Set(priceResults.map((p) => p.source))]
    return {
      success: true,
      message: `Stocks: ${updated}/${holdings.length} holdings updated (${symbols.join(', ')}) via ${sources.join(', ')}`,
    }
  } catch (error) {
    return {
      success: false,
      message: 'Stock sync failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function syncBank(accountId?: string): Promise<SyncResult> {
  // Bank balances are entered manually — no live sync available.
  return {
    success: false,
    message: 'Bank balance sync is manual. Update the balance directly on the Accounts page.',
    accountId,
  }
}

async function syncBrokerage(accountId?: string): Promise<SyncResult> {
  // No direct API — but we can still refresh market prices for all holdings in the account
  try {
    const { prisma } = await import('@/lib/prisma')
    const { updatePriceCache } = await import('@/lib/market-data')

    const holdings = await prisma.holding.findMany({
      where: {
        assetClass: { in: ['STOCK', 'ETF', 'BOND', 'OTHER'] },
        account: { isActive: true },
        ...(accountId ? { accountId } : {}),
      },
    })

    if (holdings.length === 0) {
      return {
        success: false,
        message: 'Brokerage auto-sync unavailable (no direct API). Import a CSV to add holdings.',
        error: 'Direct API not available for Excellence Trade. Please use CSV import.',
        accountId,
      }
    }

    const symbols = [...new Set(holdings.map((h) => h.symbol))]
    const priceResults = await updatePriceCache(symbols, prisma)
    const priceMap = Object.fromEntries(priceResults.map((p) => [p.symbol, p]))

    let updated = 0
    for (const holding of holdings) {
      const priceData = priceMap[holding.symbol]
      if (!priceData || priceData.source === 'mock') continue
      await prisma.holding.update({
        where: { id: holding.id },
        data: {
          currentPrice: priceData.price,
          currentValue: priceData.price * holding.quantity,
          dailyChangePercent: priceData.changePercent24h,
          // Resolve company name if holding still uses symbol as name
          ...(priceData.name && holding.name === holding.symbol ? { name: priceData.name } : {}),
          updatedAt: new Date(),
        },
      })
      updated++
    }

    if (accountId) {
      await prisma.account.update({
        where: { id: accountId },
        data: { lastSyncedAt: new Date() },
      })
    }

    await snapshotNetWorth()

    return {
      success: true,
      message: `Prices updated for ${updated}/${holdings.length} holdings (${symbols.join(', ')}). Note: CSV import is required to sync transactions.`,
      accountId,
    }
  } catch (error) {
    return {
      success: false,
      message: 'Brokerage price sync failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    }
  }
}

async function syncCrypto(accountId?: string): Promise<SyncResult> {
  const { fetchCryptoPrice } = await import('@/lib/market-data')

  // Priority: env var → DB account metadata → manual mode (no address)
  // env var always wins so it can be used as an override without touching the DB.
  let btcAddress = process.env.BTC_ADDRESS
  let ethAddress = process.env.ETH_ADDRESS

  if (accountId && (!btcAddress || !ethAddress)) {
    try {
      const { prisma } = await import('@/lib/prisma')
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { metadata: true },
      })
      if (account?.metadata) {
        const meta = account.metadata as Record<string, string | undefined>
        if (!btcAddress && meta.btcAddress) btcAddress = meta.btcAddress
        if (!ethAddress && meta.ethAddress) ethAddress = meta.ethAddress
      }
    } catch {
      // DB not available — stay in manual mode
    }
  }

  const messages: string[] = []
  let anySuccess = false

  // -------------------------------------------------------------------------
  // BTC — always runs (manual mode or watch-only)
  // -------------------------------------------------------------------------
  const btcPrice = await fetchCryptoPrice('BTC')

  if (btcAddress) {
    // Watch-only mode: get real on-chain balance from blockchain.info
    const { CryptoAdapter } = await import('@/lib/adapters/crypto')
    const adapter = new CryptoAdapter({ address: btcAddress, coin: 'BTC', accountId })
    const result = await adapter.getBalance()

    if (result.success && result.data) {
      anySuccess = true
      const usdValue = result.data.balance * btcPrice.price
      messages.push(
        `BTC (watch-only): ${result.data.balance.toFixed(6)} BTC × $${btcPrice.price.toLocaleString()} = $${usdValue.toLocaleString()}`
      )
      if (accountId) {
        try {
          const { prisma } = await import('@/lib/prisma')
          const btcHolding = await prisma.holding.findFirst({
            where: { accountId, symbol: 'BTC' },
          })
          if (btcHolding) {
            await prisma.holding.update({
              where: { id: btcHolding.id },
              data: {
                quantity: result.data.balance,
                currentPrice: btcPrice.price,
                currentValue: usdValue,
                dailyChangePercent: btcPrice.changePercent24h,
                updatedAt: new Date(),
              },
            })
          } else {
            // Holding doesn't exist yet — create it so the balance is never lost
            await prisma.holding.create({
              data: {
                accountId,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: 'CRYPTO',
                quantity: result.data.balance,
                currentPrice: btcPrice.price,
                currentValue: usdValue,
                dailyChangePercent: btcPrice.changePercent24h,
                currency: 'USD',
              },
            })
          }
          await prisma.account.update({
            where: { id: accountId },
            data: { lastSyncedAt: new Date() },
          })
        } catch { /* DB not available */ }
      }
    } else {
      messages.push(`BTC watch-only sync failed: ${result.error}`)
    }
  } else {
    // Manual mode: keep stored quantity, update price only
    if (accountId) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const holding = await prisma.holding.findFirst({ where: { accountId, symbol: 'BTC' } })
        if (holding && holding.quantity > 0) {
          const usdValue = holding.quantity * btcPrice.price
          await prisma.holding.update({
            where: { id: holding.id },
            data: {
              currentPrice: btcPrice.price,
              currentValue: usdValue,
              dailyChangePercent: btcPrice.changePercent24h,
              updatedAt: new Date(),
            },
          })
          await prisma.account.update({
            where: { id: accountId },
            data: { lastSyncedAt: new Date() },
          })
          anySuccess = true
          messages.push(
            `BTC (manual): ${holding.quantity} BTC × $${btcPrice.price.toLocaleString()} = $${usdValue.toLocaleString()} — price source: ${btcPrice.source}`
          )
        } else {
          // No DB holding found — still report price update as success
          anySuccess = true
          messages.push(`BTC price updated: $${btcPrice.price.toLocaleString()} (${btcPrice.source})`)
        }
      } catch {
        // DB not available — price fetched, report success anyway
        anySuccess = true
        messages.push(`BTC price: $${btcPrice.price.toLocaleString()} (${btcPrice.source}) — DB unavailable, not persisted`)
      }
    } else {
      // No specific accountId — refresh prices across ALL manual crypto holdings
      anySuccess = true
      try {
        const { prisma } = await import('@/lib/prisma')
        const cryptoAccounts = await prisma.account.findMany({
          where: { type: 'CRYPTO', isActive: true },
        })
        let updated = false
        for (const acc of cryptoAccounts) {
          const holding = await prisma.holding.findFirst({
            where: { accountId: acc.id, symbol: 'BTC' },
          })
          if (holding && holding.quantity > 0) {
            const usdValue = holding.quantity * btcPrice.price
            await prisma.holding.update({
              where: { id: holding.id },
              data: {
                currentPrice: btcPrice.price,
                currentValue: usdValue,
                dailyChangePercent: btcPrice.changePercent24h,
                updatedAt: new Date(),
              },
            })
            await prisma.account.update({
              where: { id: acc.id },
              data: { lastSyncedAt: new Date() },
            })
            messages.push(
              `BTC (manual): ${holding.quantity} BTC × $${btcPrice.price.toLocaleString()} = $${usdValue.toLocaleString()} — ${btcPrice.source}`
            )
            updated = true
          }
        }
        if (!updated) {
          messages.push(`BTC price: $${btcPrice.price.toLocaleString()} (${btcPrice.source})`)
        }
      } catch {
        // DB not available — snapshot will use whatever values are stored
        messages.push(`BTC price: $${btcPrice.price.toLocaleString()} (${btcPrice.source}) — DB unavailable`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // ETH — only runs when ETH_ADDRESS is configured
  // -------------------------------------------------------------------------
  if (ethAddress) {
    const { CryptoAdapter } = await import('@/lib/adapters/crypto')
    const adapter = new CryptoAdapter({ address: ethAddress, coin: 'ETH', accountId })
    const result = await adapter.getBalance()
    const ethPrice = await fetchCryptoPrice('ETH')

    if (result.success && result.data) {
      anySuccess = true
      const usdValue = result.data.balance * ethPrice.price
      messages.push(
        `ETH (watch-only): ${result.data.balance.toFixed(4)} ETH × $${ethPrice.price.toLocaleString()} = $${usdValue.toLocaleString()}`
      )
      try {
        const { prisma } = await import('@/lib/prisma')

        // When a specific accountId is given, update that account's ETH holding.
        // When syncing by env-var address (no accountId), only update accounts
        // whose metadata.ethAddress matches — never blindly overwrite every ETH
        // holding across all accounts (they may belong to different wallets).
        let targetAccountIds: string[]
        if (accountId) {
          targetAccountIds = [accountId]
        } else {
          const accounts = await prisma.account.findMany({
            where: { isActive: true, type: 'CRYPTO' },
            select: { id: true, metadata: true },
          })
          targetAccountIds = accounts
            .filter((a) => {
              const meta = a.metadata as Record<string, unknown>
              return meta.ethAddress === ethAddress
            })
            .map((a) => a.id)

          // Fallback: if no account explicitly claims this address, update all
          // CRYPTO accounts that have an ETH holding (pre-existing single-wallet
          // setups where the address wasn't stored in metadata).
          if (targetAccountIds.length === 0) {
            const ethHoldings = await prisma.holding.findMany({
              where: { symbol: 'ETH', account: { type: 'CRYPTO' } },
              select: { accountId: true },
              distinct: ['accountId'],
            })
            targetAccountIds = ethHoldings.map((h) => h.accountId)
          }
        }

        const holdingUpdateData = {
          quantity: result.data.balance,
          currentPrice: ethPrice.price,
          currentValue: usdValue,
          dailyChangePercent: ethPrice.changePercent24h,
          updatedAt: new Date(),
        }
        // Batch all DB writes into a single transaction to avoid N+1 query loops
        await prisma.$transaction([
          prisma.holding.updateMany({
            where: { accountId: { in: targetAccountIds }, symbol: 'ETH' },
            data: holdingUpdateData,
          }),
          ...targetAccountIds.map((aid) =>
            prisma.account.update({
              where: { id: aid },
              data: { lastSyncedAt: new Date() },
            })
          ),
        ])
      } catch { /* DB not available */ }
    } else {
      messages.push(`ETH watch-only sync failed: ${result.error}`)
    }
  }
  // If no ETH_ADDRESS: silently skip — ETH is fully optional.

  if (anySuccess) {
    await snapshotNetWorth()
  }

  return {
    success: anySuccess,
    message: messages.join(' | '),
    accountId,
  }
}

export async function POST(request: NextRequest) {
  const { checkAndSetSyncRateLimit } = await import('@/lib/user-settings')
  const { allowed, retryAfter } = await checkAndSetSyncRateLimit(SYNC_COOLDOWN_MS)
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  try {
    const body = await request.json()
    const { accountId, adapter: adapterType } = body as {
      accountId?: string
      adapter: 'crypto' | 'bank' | 'brokerage' | 'all'
    }

    if (!adapterType) {
      return NextResponse.json(
        { error: 'adapter is required: crypto | bank | brokerage | all' },
        { status: 400 }
      )
    }

    if (adapterType === 'bank') {
      return NextResponse.json(await syncBank(accountId))
    }

    if (adapterType === 'brokerage') {
      return NextResponse.json(await syncBrokerage(accountId))
    }

    if (adapterType === 'crypto') {
      return NextResponse.json(await syncCrypto(accountId))
    }

    if (adapterType === 'all') {
      const [bank, brokerage, crypto, stocks] = await Promise.all([
        syncBank(accountId),
        syncBrokerage(accountId),
        syncCrypto(accountId),
        syncStocks(),
      ])
      return NextResponse.json({
        success: bank.success || brokerage.success || crypto.success || stocks.success,
        message: [bank.message, brokerage.message, crypto.message, stocks.message].filter(Boolean).join(' | '),
        results: { bank, brokerage, crypto, stocks },
        accountId,
      })
    }

    return NextResponse.json(
      { error: `Unknown adapter: ${adapterType}` },
      { status: 400 }
    )
  } catch (error) {
    console.error('[/api/sync]', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Sync failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      } as SyncResult,
      { status: 500 }
    )
  }
}
