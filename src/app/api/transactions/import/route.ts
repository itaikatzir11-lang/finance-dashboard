import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { ImportResult, RowError, ParsedTransaction } from '@/types'

/**
 * Splits an adapter errors array into:
 *  - rowErrors: structured { row, message } objects for "Row N: ..." strings
 *  - generalErrors: everything else (format warnings, system notes)
 */
function splitErrors(errors: string[]): { rowErrors: RowError[]; generalErrors: string[] } {
  const rowErrors: RowError[] = []
  const generalErrors: string[] = []
  const rowPattern = /^Row\s+(\d+):\s*(.+)$/i
  for (const err of errors) {
    const match = rowPattern.exec(err)
    if (match) {
      rowErrors.push({ row: parseInt(match[1], 10), message: match[2].trim() })
    } else {
      generalErrors.push(err)
    }
  }
  return { rowErrors, generalErrors }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const accountId = formData.get('accountId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    }
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    const csvContent = await file.text()

    // Determine which parser to use based on account type
    let accountType = 'BROKERAGE'
    try {
      const { prisma } = await import('@/lib/prisma')
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { type: true },
      })
      if (!account) {
        return NextResponse.json({ error: `Account ${accountId} not found` }, { status: 404 })
      }
      accountType = account.type
    } catch {
      // DB unavailable — default to brokerage parser
    }

    // Parse using the correct adapter for the account type
    let transactions: ParsedTransaction[]
    let errors: string[]
    let totalParsed = 0
    let lastBalance: number | undefined

    if (accountType === 'BANK') {
      const { DiscountBankAdapter } = await import('@/lib/adapters/discount-bank')
      const result = new DiscountBankAdapter({ accountId }).parseCSV(csvContent)
      transactions = result.transactions
      errors = result.errors
      totalParsed = result.totalParsed
      lastBalance = result.lastBalance
    } else {
      const { ExcellenceTradeAdapter } = await import('@/lib/adapters/excellence-trade')
      const result = new ExcellenceTradeAdapter({ accountId }).parseCSV(csvContent)
      transactions = result.transactions
      errors = result.errors
      totalParsed = result.totalParsed
    }

    const skipped = Math.max(0, totalParsed - transactions.length - errors.filter((e) => e.startsWith('Row')).length)

    if (transactions.length === 0) {
      const { rowErrors, generalErrors } = splitErrors(errors)
      return NextResponse.json({
        success: false,
        imported: 0,
        skipped,
        errors: generalErrors.length > 0
          ? generalErrors
          : ['No valid transactions found. Check the file matches the expected format for this account type.'],
        rowErrors,
      } as ImportResult, { status: 422 })
    }

    try {
      const { prisma } = await import('@/lib/prisma')
      const account = await prisma.account.findUnique({ where: { id: accountId } })
      if (!account) {
        return NextResponse.json({ error: `Account ${accountId} not found` }, { status: 404 })
      }

      // ── Deduplication: skip rows that already exist in the DB ───────────────
      // Match on accountId + exact datetime + amount + description.
      // Using full ISO timestamp (not date-only) so multiple transactions on
      // the same day with the same amount are never incorrectly merged.
      const existing = await prisma.transaction.findMany({
        where: { accountId },
        select: { date: true, amount: true, description: true },
      })
      const existingKeys = new Set(
        existing.map((tx) => `${tx.date.toISOString()}|${tx.amount}|${tx.description ?? ''}`)
      )

      const newTransactions = transactions.filter((tx) => {
        const key = `${new Date(tx.date).toISOString()}|${tx.amount}|${tx.description ?? ''}`
        return !existingKeys.has(key)
      })
      const duplicateCount = transactions.length - newTransactions.length

      if (newTransactions.length === 0) {
        const { rowErrors, generalErrors } = splitErrors(errors)
        return NextResponse.json({
          success: true,
          imported: 0,
          skipped: skipped + duplicateCount,
          errors: [...generalErrors, `All ${transactions.length} rows already exist in the database — nothing imported.`],
          rowErrors,
        } as ImportResult)
      }

      const importedAt = new Date()
      const created = await prisma.$transaction(
        newTransactions.map((tx) =>
          prisma.transaction.create({
            data: {
              accountId,
              type: tx.type,
              symbol: tx.symbol || null,
              quantity: tx.quantity || null,
              price: tx.price || null,
              amount: tx.amount,
              currency: account.currency,
              description: tx.description || null,
              date: new Date(tx.date),
              importedAt,
              source: 'CSV_IMPORT',
            },
          })
        )
      )
      const totalSkipped = skipped + duplicateCount

      // ── Bank: update account balance + lastSyncedAt from last CSV balance row ──
      if (accountType === 'BANK') {
        await prisma.account.update({
          where: { id: accountId },
          data: {
            ...(lastBalance !== undefined ? { balance: lastBalance } : {}),
            lastSyncedAt: new Date(),
          },
        })
      }

      // ── Brokerage: upsert Holdings from BUY/SELL transactions ───────────────
      if (accountType === 'BROKERAGE') {
        const tradeSymbols = [...new Set(
          newTransactions
            .filter((tx) => (tx.type === 'BUY' || tx.type === 'SELL') && tx.symbol)
            .map((tx) => tx.symbol.toUpperCase())
        )]

        for (const symbol of tradeSymbols) {
          // Read ALL historical transactions for this symbol + account to compute position
          const allTxForSymbol = await prisma.transaction.findMany({
            where: { accountId, symbol },
          })

          let netQty = 0
          let totalCost = 0
          let totalBought = 0

          for (const tx of allTxForSymbol) {
            const qty = tx.quantity ?? 0
            if (tx.type === 'BUY') {
              netQty += qty
              totalCost += Math.abs(tx.amount)
              totalBought += qty
            } else if (tx.type === 'SELL') {
              netQty -= qty
            }
          }

          if (netQty <= 0) {
            // Position closed — remove holding if it exists
            await prisma.holding.deleteMany({ where: { accountId, symbol } })
            continue
          }

          const avgCostBasis = totalBought > 0 ? totalCost / totalBought : null

          // Fetch latest price from cache (or use last known price from transactions)
          const cached = await prisma.priceCache.findUnique({ where: { symbol } })
          const currentPrice = cached?.price ??
            newTransactions.filter((tx) => tx.symbol === symbol && tx.price).pop()?.price ??
            (avgCostBasis ?? 0)

          const existing = await prisma.holding.findFirst({ where: { accountId, symbol } })

          if (existing) {
            await prisma.holding.update({
              where: { id: existing.id },
              data: {
                quantity: netQty,
                avgCostBasis,
                currentPrice,
                currentValue: netQty * currentPrice,
              },
            })
          } else {
            await prisma.holding.create({
              data: {
                accountId,
                symbol,
                name: symbol,
                assetClass: 'STOCK',
                quantity: netQty,
                avgCostBasis,
                currentPrice,
                currentValue: netQty * currentPrice,
                dailyChangePercent: 0,
                currency: account.currency,
              },
            })
          }
        }

        // Auto-refresh live prices + resolve company names for all newly touched holdings.
        // Single findMany for all symbols, then concurrent updates — no N+1.
        if (tradeSymbols.length > 0) {
          try {
            const { updatePriceCache } = await import('@/lib/market-data')
            const [priceResults, touchedHoldings] = await Promise.all([
              updatePriceCache(tradeSymbols, prisma),
              prisma.holding.findMany({ where: { accountId, symbol: { in: tradeSymbols } } }),
            ])
            const priceMap = Object.fromEntries(priceResults.map((p) => [p.symbol, p]))
            const holdingMap = Object.fromEntries(touchedHoldings.map((h) => [h.symbol, h]))

            await Promise.all(
              tradeSymbols.map(async (symbol) => {
                const priceData = priceMap[symbol]
                const holding = holdingMap[symbol]
                if (!holding) return
                const updateData: Record<string, unknown> = {}
                if (priceData && priceData.source !== 'mock' && priceData.price > 0) {
                  updateData.currentPrice = priceData.price
                  updateData.currentValue = priceData.price * holding.quantity
                  updateData.dailyChangePercent = priceData.changePercent24h
                }
                if (priceData?.name && holding.name === symbol) {
                  updateData.name = priceData.name
                }
                if (Object.keys(updateData).length > 0) {
                  await prisma.holding.update({ where: { id: holding.id }, data: updateData })
                }
              })
            )
          } catch { /* price refresh is best-effort */ }
        }

        // Mark account as synced
        await prisma.account.update({
          where: { id: accountId },
          data: { lastSyncedAt: new Date() },
        })
      }

      const { rowErrors, generalErrors } = splitErrors(errors)
      return NextResponse.json({
        success: true,
        imported: created.length,
        skipped: totalSkipped,
        errors: generalErrors,
        rowErrors,
      } as ImportResult)
    } catch (dbError) {
      console.error('[/api/transactions/import] DB error', dbError)
      const { rowErrors, generalErrors } = splitErrors(errors)
      return NextResponse.json({
        success: false,
        imported: 0,
        skipped: transactions.length + skipped,
        errors: [
          ...generalErrors,
          `Database write failed. The CSV was parsed correctly (${transactions.length} rows) but could not be persisted. Please check your database connection and try again.`,
        ],
        rowErrors,
      } as ImportResult, { status: 500 })
    }
  } catch (error) {
    console.error('[/api/transactions/import]', error)
    return NextResponse.json({ error: 'Failed to import transactions' }, { status: 500 })
  }
}
