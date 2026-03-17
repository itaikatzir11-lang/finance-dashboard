/**
 * Hebrew Reply Parser
 *
 * Uses Claude (Haiku, for cost efficiency) to extract structured balance
 * updates from a free-text Hebrew reply, then writes them to the database.
 */

export interface ParsedUpdate {
  bank?: number       // ILS balance
  brokerage?: number  // ILS balance
  pension?: number    // ILS balance
  btcQty?: number     // BTC quantity (if user specified BTC units)
  btcIls?: number     // ILS value (if user specified in ILS/shekels)
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export async function parseHebrewReply(text: string): Promise<ParsedUpdate> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return parseWithRegex(text)

  const prompt = [
    `המשתמש שלח הודעה עם עדכון סכומים פיננסיים. חלץ את הסכומים ותחזיר אובייקט JSON בלבד.`,
    ``,
    `שדות אפשריים (כלול רק שדות שמוזכרים בטקסט):`,
    `  "bank"     — עו"ש / חשבון עו"ש / בנק (בשקלים)`,
    `  "brokerage"— אקסלנס / ניירות ערך / בורסה / מניות (בשקלים)`,
    `  "pension"  — פנסיה (בשקלים)`,
    `  "btcQty"   — ביטקוין / BTC כשהסכום הוא כמות ב-BTC (מספר קטן, לדוגמה 0.45)`,
    `  "btcIls"   — ביטקוין / BTC כשהסכום הוא בשקלים (מספר גדול)`,
    ``,
    `חוקים:`,
    `- הסר פסיקים ורווחים ממספרים`,
    `- אם ביטקוין נכתב כ-"0.45 BTC" או מספר קטן מ-100 — שים ב-btcQty`,
    `- אם ביטקוין נכתב כסכום שקלים גדול — שים ב-btcIls`,
    `- החזר ONLY valid JSON, ללא הסברים`,
    ``,
    `הטקסט: "${text}"`,
    ``,
    `דוגמת פלט: {"bank":52000,"pension":215000,"btcQty":0.45}`,
  ].join('\n')

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    return JSON.parse(cleaned) as ParsedUpdate
  } catch {
    return parseWithRegex(text)
  }
}

/** Regex fallback when Claude is unavailable */
function parseWithRegex(text: string): ParsedUpdate {
  const result: ParsedUpdate = {}

  const extract = (pattern: RegExp): number | undefined => {
    const m = text.match(pattern)
    return m ? parseFloat(m[1].replace(/[,\s]/g, '')) : undefined
  }

  result.bank = extract(/(?:עו["״]ש|עוש|בנק)[:\s]*([0-9][0-9,\s]*)/i)
  result.brokerage = extract(/(?:אקסלנס|בורסה|ניירות\s*ערך|מניות)[:\s]*([0-9][0-9,\s]*)/i)
  result.pension = extract(/(?:פנסיה)[:\s]*([0-9][0-9,\s]*)/i)

  const btcRaw = text.match(/(?:ביטקוין|bitcoin|btc)[:\s]*([0-9][0-9.,]*)/i)
  if (btcRaw) {
    const val = parseFloat(btcRaw[1].replace(/,/g, ''))
    if (val < 100) {
      result.btcQty = val
    } else {
      result.btcIls = val
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Database updates
// ---------------------------------------------------------------------------

export async function applyBalanceUpdates(updates: ParsedUpdate): Promise<string[]> {
  const { prisma } = await import('@/lib/prisma')
  const applied: string[] = []

  // ── Bank ──────────────────────────────────────────────────────────────────
  if (updates.bank !== undefined && updates.bank > 0) {
    const acc = await prisma.account.findFirst({ where: { type: 'BANK', isActive: true } })
    if (acc) {
      await prisma.account.update({ where: { id: acc.id }, data: { balance: updates.bank } })
      applied.push(`עו"ש: ₪${updates.bank.toLocaleString('he-IL')}`)
    }
  }

  // ── Brokerage ─────────────────────────────────────────────────────────────
  if (updates.brokerage !== undefined && updates.brokerage > 0) {
    const acc = await prisma.account.findFirst({ where: { type: 'BROKERAGE', isActive: true } })
    if (acc) {
      await prisma.account.update({ where: { id: acc.id }, data: { balance: updates.brokerage } })
      applied.push(`אקסלנס: ₪${updates.brokerage.toLocaleString('he-IL')}`)
    }
  }

  // ── Pension (creates/updates virtual SPY holding) ─────────────────────────
  if (updates.pension !== undefined && updates.pension > 0) {
    const acc = await prisma.account.findFirst({ where: { type: 'PENSION', isActive: true } })
    if (acc) {
      await prisma.account.update({ where: { id: acc.id }, data: { balance: updates.pension } })

      // Mirror the logic from PUT /api/accounts/[id]: create/update SPY holding
      try {
        const { fetchPrice } = await import('@/lib/market-data')
        const { getIlsToUsd } = await import('@/lib/fx-rate')
        const [spyResult, ilsToUsd] = await Promise.all([fetchPrice('SPY'), getIlsToUsd()])
        if (spyResult.price > 0) {
          const balanceUsd = acc.currency === 'ILS' ? updates.pension * ilsToUsd : updates.pension
          const qty = balanceUsd / spyResult.price
          const existing = await prisma.holding.findFirst({
            where: { accountId: acc.id, symbol: 'SPY' },
          })
          if (existing) {
            await prisma.holding.update({
              where: { id: existing.id },
              data: {
                quantity: qty,
                currentPrice: spyResult.price,
                currentValue: balanceUsd,
                dailyChangePercent: spyResult.changePercent24h,
              },
            })
          } else {
            await prisma.holding.create({
              data: {
                accountId: acc.id,
                symbol: 'SPY',
                name: 'S&P 500 (SPY) — Pension',
                assetClass: 'ETF',
                quantity: qty,
                currentPrice: spyResult.price,
                currentValue: balanceUsd,
                dailyChangePercent: spyResult.changePercent24h,
                currency: 'USD',
              },
            })
          }
        }
      } catch {
        // Non-fatal — SPY holding updated on next sync
      }

      applied.push(`פנסיה: ₪${updates.pension.toLocaleString('he-IL')}`)
    }
  }

  // ── Bitcoin ───────────────────────────────────────────────────────────────
  if ((updates.btcQty !== undefined && updates.btcQty > 0) ||
      (updates.btcIls !== undefined && updates.btcIls > 0)) {
    const acc = await prisma.account.findFirst({ where: { type: 'CRYPTO', isActive: true } })
    if (acc) {
      if (updates.btcQty !== undefined && updates.btcQty > 0) {
        // BTC quantity — fetch live price
        try {
          const { fetchPrice } = await import('@/lib/market-data')
          const btcResult = await fetchPrice('BTC')
          const valueUsd = btcResult.price > 0 ? updates.btcQty * btcResult.price : 0

          const existing = await prisma.holding.findFirst({
            where: { accountId: acc.id, symbol: 'BTC' },
          })
          if (existing) {
            await prisma.holding.update({
              where: { id: existing.id },
              data: {
                quantity: updates.btcQty,
                currentPrice: btcResult.price,
                currentValue: valueUsd,
                dailyChangePercent: btcResult.changePercent24h,
              },
            })
          } else {
            await prisma.holding.create({
              data: {
                accountId: acc.id,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: 'CRYPTO',
                quantity: updates.btcQty,
                currentPrice: btcResult.price,
                currentValue: valueUsd,
                dailyChangePercent: btcResult.changePercent24h,
                currency: 'USD',
              },
            })
          }
        } catch {
          // Price unavailable — store quantity only, sync will fix price
        }
        applied.push(`ביטקוין: ${updates.btcQty} BTC`)
      } else if (updates.btcIls !== undefined) {
        // ILS value — store as account balance
        await prisma.account.update({
          where: { id: acc.id },
          data: { balance: updates.btcIls },
        })
        applied.push(`ביטקוין: ₪${updates.btcIls.toLocaleString('he-IL')}`)
      }
    }
  }

  return applied
}

// ---------------------------------------------------------------------------
// Confirmation message
// ---------------------------------------------------------------------------

export function buildConfirmationMessage(applied: string[]): string {
  if (applied.length === 0) {
    return [
      'לא הצלחתי לזהות סכומים לעדכון. 🤔',
      '',
      'אנא נסה/י שוב בפורמט זה:',
      'עו"ש: 52,000',
      'אקסלנס: 135,000',
      'פנסיה: 215,000',
      'ביטקוין: 0.45',
    ].join('\n')
  }

  const appUrl = process.env.APP_URL ?? 'FinDash'
  return [
    '✅ העדכון בוצע בהצלחה!',
    '',
    'הסכומים שעודכנו:',
    ...applied.map((a) => `• ${a}`),
    '',
    `לצפייה בפורטפוליו המעודכן: ${appUrl}`,
  ].join('\n')
}
