/**
 * POST /api/holdings/import-pdf
 *
 * Accepts a multipart/form-data upload containing:
 *   - file:      PDF binary (the Excellence Trade "דו"ח תקופתי")
 *   - accountId: string — the BROKERAGE account to update
 *
 * Returns:
 *   { imported: number, skipped: number, holdings: ParsedHolding[], warnings: string[] }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PARSING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Extract raw text from the PDF using pdf-parse.
 * 2. Send the raw text to Claude (claude-haiku-4-5) with a strict system prompt
 *    that defines exact start/stop boundaries, column mappings, and output
 *    contract (pure JSON array — no markdown, no prose).
 * 3. Parse the JSON array returned by Claude into ParsedHolding[].
 * 4. Upsert holdings into the DB (ILS → USD via live FX rate).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOUNDARY RULES (enforced via system prompt)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * START: after finding column headers
 *   "אחוז מהתיק","שווי נייר בשקלים","עלות הרכישה","שער נוכחי","כמות","שם נייר","מספר נייר"
 *
 * STOP: immediately upon seeing "סה"כ" or "פירוט תנועות"
 *   Everything after these stop-words is IGNORED.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedHolding {
  /** Security ID / ticker from "מספר נייר". Use "CASH" for the cash row. */
  symbol: string
  /** Hebrew security name from "שם נייר" */
  name: string
  /** Quantity from "כמות" */
  quantity: number
  /** Current price (ILS) from "שער נוכחי" */
  currentPriceIls: number
  /** Total current value (ILS) from "שווי נייר בשקלים" */
  currentValueIls: number
  /** Total cost basis (ILS) from "עלות הרכישה". Null if not present. */
  costBasisIls: number | null
}

// ── System prompt for the LLM extractor ───────────────────────────────────────

// Compact extraction prompt — Haiku is fast and cheap; keep prompt tokens minimal.
const EXTRACTION_SYSTEM_PROMPT = `Extract holdings from an Excellence Trade Hebrew PDF report.

BOUNDARIES:
- START after headers containing: אחוז מהתיק שווי נייר בשקלים עלות הרכישה שער נוכחי כמות שם נייר מספר נייר
- STOP immediately at "סה"כ" or "פירוט תנועות". Ignore everything after.

MAPPING (one JSON object per row):
  מספר נייר         → symbol (string)
  שם נייר           → name (string)
  כמות              → quantity (number)
  שער נוכחי         → currentPriceIls (number)
  שווי נייר בשקלים  → currentValueIls (number)
  עלות הרכישה       → costBasisIls (number or null if missing)
  אחוז מהתיק        → ignore

CASH ROW: if row contains "יתרה כספית" → symbol="CASH", quantity=1, currentPriceIls=currentValueIls=costBasisIls=<שווי value>

CLEANING: strip commas from numbers ("1,234.5" → 1234.5). Do not convert currency.

OUTPUT: raw JSON array only — no markdown, no prose.
Example: [{"symbol":"1082276","name":"מניה","quantity":100,"currentPriceIls":52.3,"currentValueIls":5230,"costBasisIls":4800}]`

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Parse multipart form ────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const accountId = formData.get('accountId')
  const file = formData.get('file')

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!file.type.includes('pdf') && !(file as File).name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 })
  }

  // ── 2. Verify account exists and is a BROKERAGE account ───────────────────
  try {
    const { prisma } = await import('@/lib/prisma')
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, type: true, currency: true },
    })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    if (account.type !== 'BROKERAGE') {
      return NextResponse.json(
        { error: 'PDF import is only supported for BROKERAGE accounts' },
        { status: 422 }
      )
    }
  } catch (error) {
    console.error('[POST /api/holdings/import-pdf] DB lookup failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // ── 3. Extract text from PDF ───────────────────────────────────────────────
  let pdfText: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    const pdfParse = pdfParseModule.default ?? pdfParseModule
    const buffer = Buffer.from(await file.arrayBuffer())
    const { text } = await pdfParse(buffer)
    pdfText = text
  } catch (error) {
    console.error('[POST /api/holdings/import-pdf] PDF extraction failed:', error)
    return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 422 })
  }

  if (!pdfText.trim()) {
    return NextResponse.json({ error: 'PDF appears to be empty or image-only' }, { status: 422 })
  }

  // ── 4. Send extracted text to Claude for structured extraction ─────────────
  let parsedHoldings: ParsedHolding[] = []
  const warnings: string[] = []

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured — cannot parse PDF' },
      { status: 503 }
    )
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the extracted text from the Excellence Trade PDF. Extract the holdings as instructed:\n\n${pdfText}`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Claude returned no text content' }, { status: 500 })
    }

    // Strip any accidental markdown fences before parsing
    const rawJson = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    try {
      const parsed = JSON.parse(rawJson)
      if (!Array.isArray(parsed)) {
        throw new Error('Expected a JSON array')
      }
      parsedHoldings = parsed as ParsedHolding[]
    } catch (parseErr) {
      console.error('[POST /api/holdings/import-pdf] JSON parse error:', parseErr)
      console.error('Raw Claude output:', textBlock.text.slice(0, 500))
      return NextResponse.json(
        { error: 'Claude returned malformed JSON — could not parse holdings' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[POST /api/holdings/import-pdf] Claude API error:', error)
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
  }

  if (parsedHoldings.length === 0) {
    warnings.push(
      'No holdings were found in the PDF. Make sure this is a "פירוט יתרות" section report.'
    )
  }

  // ── 5. Upsert holdings into DB ─────────────────────────────────────────────
  let imported = 0
  let skipped = 0

  if (parsedHoldings.length > 0) {
    try {
      const { prisma } = await import('@/lib/prisma')
      const { getIlsToUsd } = await import('@/lib/fx-rate')
      const ilsToUsd = await getIlsToUsd()

      for (const h of parsedHoldings) {
        try {
          const currentValueUsd = h.currentValueIls * ilsToUsd
          const currentPriceUsd = h.currentPriceIls * ilsToUsd
          const avgCostBasisUsd =
            h.costBasisIls != null && h.quantity > 0
              ? (h.costBasisIls * ilsToUsd) / h.quantity
              : null

          const existing = await prisma.holding.findFirst({
            where: { accountId, symbol: h.symbol },
          })

          const holdingData = {
            name: h.name,
            quantity: h.quantity,
            currentPrice: currentPriceUsd,
            currentValue: currentValueUsd,
            avgCostBasis: avgCostBasisUsd,
          }

          if (existing) {
            await prisma.holding.update({ where: { id: existing.id }, data: holdingData })
          } else {
            await prisma.holding.create({
              data: {
                accountId,
                symbol: h.symbol,
                assetClass: h.symbol === 'CASH' ? 'CASH' : 'STOCK',
                currency: 'USD',
                dailyChangePercent: 0,
                ...holdingData,
              },
            })
          }
          imported++
        } catch (rowErr) {
          console.error(`[POST /api/holdings/import-pdf] Failed to upsert ${h.symbol}:`, rowErr)
          warnings.push(`Skipped ${h.symbol} — database error`)
          skipped++
        }
      }
    } catch (error) {
      console.error('[POST /api/holdings/import-pdf] DB upsert failed:', error)
      return NextResponse.json({ error: 'Failed to save holdings to database' }, { status: 500 })
    }
  }

  // ── 6. Return result ───────────────────────────────────────────────────────
  return NextResponse.json({
    imported,
    skipped,
    holdings: parsedHoldings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      value: h.currentValueIls,
    })),
    warnings,
  })
}
