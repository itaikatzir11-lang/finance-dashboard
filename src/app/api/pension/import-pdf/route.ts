/**
 * POST /api/pension/import-pdf
 *
 * Accepts a multipart/form-data request with:
 *   - `file`      : the Harel pension PDF
 *   - `accountId` : the PENSION account's DB id
 *
 * Steps:
 *   1. Extract raw text from the PDF with pdf-parse.
 *   2. Ask claude-haiku-4-5 to pull out two Hebrew fields and return pure JSON.
 *   3. Upsert the PENSION account's metadata (baseBalance, baseDate, trackedSymbol).
 *   4. Fetch the live price for the tracked symbol (default: SPY).
 *   5. Calculate a "virtual" holding quantity from the ILS balance.
 *   6. Upsert the holding row so the dashboard reflects the pension value.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getIlsToUsd } from '@/lib/fx-rate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ESM interop for pdf-parse (CommonJS default export) */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse') as any
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
    mod.default ?? mod
  const result = await pdfParse(buffer)
  return result.text
}

interface ExtractedFields {
  baseBalance: number
  baseDate: string // YYYY-MM-DD
}

/** Ask Claude Haiku to extract the two Hebrew fields from the raw text */
async function extractFromPdfText(rawText: string): Promise<ExtractedFields> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: `You are a data-extraction assistant. The user will provide raw text from a Hebrew pension report (Harel/הראל).
Extract EXACTLY two values and return ONLY a single-line JSON object with no markdown, no explanation, no code fences.

Fields to find:
1. "baseBalance": The fund balance at end of period. Look for the line containing:
   - "יתרת הכספים בקרן בסוף השנה" (annual report), OR
   - "יתרת הכספים בקרן בסוף תקופת הדיווח" (quarterly report).
   Take the number on that line. Strip commas. Return as a plain number.

2. "baseDate": The report date. Look for "תאריך הדוח:" followed by a date in DD/MM/YYYY format.
   Convert it to YYYY-MM-DD format.

Example output (no other text):
{"baseBalance":64237,"baseDate":"2025-12-31"}`,
    messages: [
      {
        role: 'user',
        content: rawText.slice(0, 40000), // cap to avoid token overrun
      },
    ],
  })

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  const parsed = JSON.parse(raw)

  if (
    typeof parsed.baseBalance !== 'number' ||
    typeof parsed.baseDate !== 'string'
  ) {
    throw new Error('Claude returned unexpected shape: ' + raw)
  }

  return { baseBalance: parsed.baseBalance, baseDate: parsed.baseDate }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Guard: require ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI extraction unavailable — ANTHROPIC_API_KEY is not set' },
      { status: 503 }
    )
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const accountId = formData.get('accountId')
  const file = formData.get('file') as File | null

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'PDF file is required' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 })
  }

  // ── Step 1: extract raw text ──────────────────────────────────────────────
  let rawText: string
  try {
    const arrayBuffer = await file.arrayBuffer()
    rawText = await extractPdfText(Buffer.from(arrayBuffer))
  } catch (err) {
    console.error('[pension/import-pdf] pdf-parse failed', err)
    return NextResponse.json({ error: 'Could not read PDF text' }, { status: 422 })
  }

  // ── Step 2: Claude extracts the two Hebrew fields ─────────────────────────
  let extracted: ExtractedFields
  try {
    extracted = await extractFromPdfText(rawText)
  } catch (err) {
    console.error('[pension/import-pdf] Claude extraction failed', err)
    return NextResponse.json(
      { error: 'Could not extract pension data from PDF. Is this a Harel pension report?' },
      { status: 422 }
    )
  }

  const { baseBalance, baseDate } = extracted

  // ── Step 3 + 4 + 5 + 6: DB work ──────────────────────────────────────────
  try {
    const { prisma } = await import('@/lib/prisma')

    // Verify the account exists and is a PENSION account
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    if (account.type !== 'PENSION') {
      return NextResponse.json(
        { error: `Account type is ${account.type}, expected PENSION` },
        { status: 400 }
      )
    }

    // Preserve existing tracked symbol or default to SPY
    const existingMeta = (account.metadata as Record<string, unknown>) ?? {}
    const pensionTrackedSymbol =
      typeof existingMeta.pensionTrackedSymbol === 'string'
        ? existingMeta.pensionTrackedSymbol
        : 'SPY'

    // Fetch live price and ILS rate in parallel
    const { fetchPrice } = await import('@/lib/market-data')
    const [priceResult, ilsToUsd] = await Promise.all([
      fetchPrice(pensionTrackedSymbol),
      getIlsToUsd(),
    ])

    const currentPrice = priceResult.price
    if (currentPrice <= 0) {
      return NextResponse.json(
        { error: `Could not fetch a valid price for tracked symbol "${pensionTrackedSymbol}"` },
        { status: 502 }
      )
    }

    // Virtual holding quantity: how many units of pensionTrackedSymbol
    // equal the pension's ILS balance when converted to USD
    const quantity = (baseBalance * ilsToUsd) / currentPrice
    const currentValue = quantity * currentPrice // ≈ baseBalance * ilsToUsd in USD

    // Update account metadata
    const updatedMeta = {
      ...existingMeta,
      pensionBaseBalance: baseBalance,
      pensionBaseDate: baseDate,
      pensionTrackedSymbol,
      pensionBaseDatePrice: currentPrice,
    }

    await prisma.account.update({
      where: { id: accountId },
      data: { metadata: updatedMeta },
    })

    // Upsert the virtual holding — match by symbol so this is consistent with
    // the holding created by POST /api/accounts (assetClass: ETF) and PUT
    // /api/accounts/[id] (assetClass: ETF). All pension paths must converge
    // on the same row; never create a second holding for the same symbol.
    //
    // Also clean up any stale OTHER-class orphan rows left by old code.
    await prisma.holding.deleteMany({
      where: { accountId, assetClass: 'OTHER' },
    })

    const existingHolding = await prisma.holding.findFirst({
      where: { accountId, symbol: pensionTrackedSymbol },
    })

    // avgCostBasis = today's live price at the moment the PDF is imported.
    // This anchors P&L to the import date rather than the PDF's report date,
    // so the dashboard shows gain/loss since the user last updated the data.
    const holdingData = {
      symbol: pensionTrackedSymbol,
      name: `Pension — tracking ${pensionTrackedSymbol}`,
      assetClass: 'ETF' as const,
      quantity,
      avgCostBasis: currentPrice, // today's price at import time; P&L tracked from here
      currentPrice,
      currentValue,
      dailyChangePercent: priceResult.changePercent24h,
      currency: 'USD',
    }

    let holding
    if (existingHolding) {
      holding = await prisma.holding.update({
        where: { id: existingHolding.id },
        data: holdingData,
      })
    } else {
      holding = await prisma.holding.create({
        data: { accountId, ...holdingData },
      })
    }

    return NextResponse.json({
      ok: true,
      baseBalance,
      baseDate,
      pensionTrackedSymbol,
      pensionBaseDatePrice: currentPrice,
      ilsToUsd,
      quantity,
      currentValueUsd: currentValue,
      holdingId: holding.id,
    })
  } catch (err) {
    console.error('[pension/import-pdf] DB error', err)
    return NextResponse.json({ error: 'Database error while saving pension data' }, { status: 500 })
  }
}
