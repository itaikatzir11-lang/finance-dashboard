import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sanitizeAccountMetadata, isValidBTCAddress } from '@/lib/btc-address'

/** 0x + exactly 40 hex characters — EIP-55 mixed-case is fine, we just check structure */
function isValidETHAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim())
}

/**
 * GET /api/accounts/[id]
 * Returns a single account with its holdings and computed stats.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { getIlsToUsd } = await import('@/lib/fx-rate')
    const { id } = params

    const [account, ilsToUsd] = await Promise.all([
      prisma.account.findUnique({ where: { id }, include: { holdings: true } }),
      getIlsToUsd(),
    ])

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Normalise every holding's currentValue into the account's own currency
    // before summing — matching the logic in GET /api/accounts (list route).
    const usdToIls = ilsToUsd > 0 ? 1 / ilsToUsd : 3.7
    const totalValue = account.holdings.reduce((sum, h) => {
      if (account.currency === 'ILS' && h.currency === 'USD') return sum + h.currentValue * usdToIls
      if (account.currency === 'USD' && h.currency === 'ILS') return sum + h.currentValue * ilsToUsd
      return sum + h.currentValue
    }, 0)

    return NextResponse.json({
      ...account,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      holdingCount: account.holdings.length,
      totalValue: totalValue > 0 ? totalValue : account.balance,
      metadata: sanitizeAccountMetadata(account.metadata as Record<string, unknown>),
    })
  } catch {
    const { MOCK_ACCOUNTS } = await import('@/lib/mock-data')
    const account = MOCK_ACCOUNTS.find((a) => a.id === params.id)
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    return NextResponse.json(account)
  }
}

/**
 * PUT /api/accounts/[id]
 * Update account name, currency, balance, and/or metadata.
 *
 * Accepted metadata keys: btcAddress, ethAddress
 * These enable watch-only crypto sync without setting env vars.
 * All other metadata keys are ignored for safety.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = params
    const body = await request.json()

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Merge allowed metadata keys into the existing metadata object
    const updateData: Record<string, unknown> = {}
    if (body.name     !== undefined) updateData.name     = body.name
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.balance !== undefined) {
      const balance = Number(body.balance)
      if (!Number.isFinite(balance) || balance < 0) {
        return NextResponse.json({ error: 'balance must be a non-negative number' }, { status: 422 })
      }
      updateData.balance = balance
    }

    if (body.metadata !== undefined && typeof body.metadata === 'object') {
      const existing = (account.metadata ?? {}) as Record<string, unknown>
      const incoming = body.metadata as Record<string, unknown>

      // Validate addresses before touching the DB — reject the whole request if invalid
      if ('btcAddress' in incoming && incoming.btcAddress !== null) {
        if (typeof incoming.btcAddress !== 'string' || !isValidBTCAddress(incoming.btcAddress as string)) {
          return NextResponse.json(
            { error: 'Invalid Bitcoin address. Supported formats: P2PKH (1…), P2SH (3…), Bech32 (bc1q…), Taproot (bc1p…).' },
            { status: 400 }
          )
        }
      }
      if ('ethAddress' in incoming && incoming.ethAddress !== null) {
        if (typeof incoming.ethAddress !== 'string' || !isValidETHAddress(incoming.ethAddress as string)) {
          return NextResponse.json(
            { error: 'Invalid Ethereum address. Must be 0x followed by 40 hex characters.' },
            { status: 400 }
          )
        }
      }

      // Only allow safe, known keys — never store private keys or seeds
      const merged: Record<string, unknown> = { ...existing }
      if ('btcAddress' in incoming) merged.btcAddress = incoming.btcAddress ?? null
      if ('ethAddress' in incoming) merged.ethAddress = incoming.ethAddress ?? null
      // Pension baseline keys — written when the user sets an official reporting date
      if ('pensionBaseBalance'   in incoming) merged.pensionBaseBalance   = incoming.pensionBaseBalance
      if ('pensionBaseDate'      in incoming) merged.pensionBaseDate      = incoming.pensionBaseDate
      if ('pensionTrackedSymbol' in incoming) merged.pensionTrackedSymbol = incoming.pensionTrackedSymbol
      if ('pensionBaseDatePrice' in incoming) merged.pensionBaseDatePrice = incoming.pensionBaseDatePrice
      updateData.metadata = merged
    }

    const updated = await prisma.account.update({
      where: { id },
      data: updateData,
    })

    // When a pension balance is saved, create/update the virtual tracked-symbol holding so
    // sync can track index performance against the pension value.
    if (account.type === 'PENSION' && body.balance !== undefined) {
      try {
        const { fetchPrice } = await import('@/lib/market-data')
        const { getIlsToUsd } = await import('@/lib/fx-rate')

        // Determine the tracked symbol — user can override (e.g. QQQ, URTH), default SPY
        const currentMeta = (updated.metadata ?? {}) as Record<string, unknown>
        const trackedSymbol = (typeof currentMeta.pensionTrackedSymbol === 'string'
          ? currentMeta.pensionTrackedSymbol
          : 'SPY').toUpperCase()

        const [tickerResult, ILS_USD] = await Promise.all([fetchPrice(trackedSymbol), getIlsToUsd()])
        if (tickerResult.price > 0) {
          const balanceIls = body.balance as number
          const balanceUsd = account.currency === 'ILS' ? balanceIls * ILS_USD : balanceIls
          const qty = balanceUsd / tickerResult.price

          // If the tracked symbol changed, remove any old holding with a different symbol.
          // Also purge any stale OTHER-class orphans created by older code paths.
          await prisma.holding.deleteMany({
            where: {
              accountId: id,
              symbol: { not: trackedSymbol },
              assetClass: { in: ['ETF', 'OTHER'] },
            },
          })

          const existingHolding = await prisma.holding.findFirst({
            where: { accountId: id, symbol: trackedSymbol },
          })

          const holdingData = {
            quantity: qty,
            currentPrice: tickerResult.price,
            currentValue: balanceUsd,
            dailyChangePercent: tickerResult.changePercent24h,
          }

          if (existingHolding) {
            await prisma.holding.update({ where: { id: existingHolding.id }, data: holdingData })
          } else {
            await prisma.holding.create({
              data: {
                accountId: id,
                symbol: trackedSymbol,
                name: `Pension — tracking ${trackedSymbol}`,
                assetClass: 'ETF',
                currency: 'USD',
                ...holdingData,
              },
            })
          }

          // Store the baseline price at the time of setting (used for growth calculation display)
          await prisma.account.update({
            where: { id },
            data: {
              metadata: {
                ...currentMeta,
                pensionBaseDatePrice: tickerResult.price,
                pensionBaseBalance: balanceIls,
              },
            },
          })
        }
      } catch {
        // Non-fatal: price unavailable, holding will be created/updated on next sync
      }
    }

    const { sanitizeAccountMetadata } = await import('@/lib/btc-address')
    return NextResponse.json({
      ...updated,
      lastSyncedAt: updated.lastSyncedAt?.toISOString() ?? null,
      createdAt:    updated.createdAt.toISOString(),
      updatedAt:    updated.updatedAt.toISOString(),
      metadata:     sanitizeAccountMetadata(updated.metadata as Record<string, unknown>),
    })
  } catch (error) {
    console.error('[PUT /api/accounts/[id]]', error)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}

/**
 * DELETE /api/accounts/[id]
 *
 * Soft-deletes an account by setting isActive = false.
 * Holdings and transactions are kept in the DB for history.
 * Cascade delete is available in the schema but we prefer soft-delete
 * so the user can recover data if needed.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = params

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    await prisma.account.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, message: 'Account deleted' })
  } catch (error) {
    console.error('[DELETE /api/accounts/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
