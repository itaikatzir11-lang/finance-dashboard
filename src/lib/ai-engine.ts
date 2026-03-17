/**
 * AI Engine — Hebrew Portfolio Intelligence
 *
 * Single source of truth for all AI-powered portfolio analysis.
 * Consumed by:
 *   - POST /api/ai-insights  (dashboard panel)
 *   - GET  /api/cron/monthly-update (scheduled monthly reports)
 *
 * Architectural decisions
 * ───────────────────────
 * Pure function module — no HTTP imports, no Prisma.
 * Callers fetch the data; this module only runs the LLM call.
 *
 * Timeout: a 20-second AbortController wraps every Claude call.
 * If Claude exceeds the budget (cold start + long output) the
 * AbortError is caught and a Hebrew static fallback is returned.
 * The cron job must never hang waiting for an AI response.
 *
 * Key absence: ANTHROPIC_API_KEY missing is a first-class state
 * (available: false), not an exception — callers never need to
 * null-check the env var themselves.
 *
 * JSON schema enforcement: The prompt provides an explicit JSON
 * schema with Hebrew field names. After parsing, recommendation
 * "type" values are validated against the allowed set before the
 * object leaves this module — no hallucinated types can escape.
 *
 * Model choice: claude-sonnet-4-6 for the deep analysis calls here.
 * The reply-parser (inbound webhook parsing) uses claude-haiku-4-5-20251001
 * because it processes one short message at a time and cost matters.
 */

import type { NetWorthBreakdown } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A single actionable Buy / Sell / Hold recommendation */
export interface PortfolioRecommendation {
  /** "קנה" = Buy | "מכור" = Sell | "החזק" = Hold */
  type: 'קנה' | 'מכור' | 'החזק'
  /** Asset name or ticker (e.g. "BTC", "SPY", 'מזומן") */
  asset: string
  /** 1-2 sentence Hebrew rationale grounded in the portfolio data */
  rationale: string
}

export interface HebrewInsights {
  available: true
  /** 3-4 sentence Hebrew narrative — current state with specific numbers */
  summary: string
  /** 2-3 sentences — allocation health, over/underweight buckets */
  allocationAnalysis: string
  /** 2 sentences — pension ↔ S&P 500 correlation and whether to maintain it */
  pensionCorrelation: string
  /** 2–4 Buy/Sell/Hold recommendations, each with data-backed rationale */
  recommendations: PortfolioRecommendation[]
  /** Single Hebrew sentence — the one thing to do this month */
  monthlyAction: string
  /** ISO 8601 timestamp of generation */
  generatedAt: string
}

export interface HebrewInsightsUnavailable {
  available: false
  message: string
}

export type InsightsResult = HebrewInsights | HebrewInsightsUnavailable

/**
 * Input contract — callers build this from whatever data they have.
 * breakdown contains USD values; ilsPerUsd converts them to ILS for display.
 */
export interface EngineInput {
  /** USD amounts per bucket, from NetWorthBreakdown */
  breakdown: NetWorthBreakdown
  /** Sum of all breakdown buckets in USD */
  totalUsd: number
  /**
   * ILS you receive for 1 USD — e.g. 3.7
   * (inverse of getIlsToUsd() which returns ~0.27)
   */
  ilsPerUsd: number
  /**
   * Optional pre-formatted string listing top holdings.
   * Passed by the API route; omitted by the cron job (uses bucket summary only).
   */
  holdingsSummary?: string
  /**
   * The user's saved investment thesis from UserSettings.
   * When present, every recommendation and analysis must align with it.
   */
  userThesis?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback — returned on timeout, JSON parse error, or any Claude error
// ─────────────────────────────────────────────────────────────────────────────

function buildFallback(): HebrewInsights {
  return {
    available: true,
    summary:
      'הניתוח האוטומטי אינו זמין כרגע. בדוק כי ANTHROPIC_API_KEY מוגדר ושרת ה-AI נגיש.',
    allocationAnalysis:
      'לא ניתן לנתח את הקצאת הנכסים ללא חיבור ל-AI.',
    pensionCorrelation:
      'ניתוח מתאם הפנסיה ל-S&P 500 אינו זמין כעת.',
    recommendations: [
      {
        type: 'החזק',
        asset: 'כלל הנכסים',
        rationale: 'אין מספיק מידע להמלצה ספציפית. בדוק את הגדרות המערכת.',
      },
    ],
    monthlyAction: 'בדוק את חיבור ה-AI ועדכן את ANTHROPIC_API_KEY.',
    generatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────────────────────

function toIls(usdVal: number, ilsPerUsd: number): string {
  const ils = usdVal * ilsPerUsd
  return `₪${Math.round(ils).toLocaleString('he-IL')}`
}

function fmtUsd(usdVal: number): string {
  return `$${Math.round(usdVal).toLocaleString('en-US')}`
}

function pct(part: number, total: number): string {
  if (total === 0) return '0.0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function buildSystemPrompt(userThesis?: string): string {
  const lines = [
    'אתה יועץ פיננסי כמותי בכיר המתמחה בשוק ההון הישראלי ובשווקים הגלובליים.',
    'תפקידך: לנתח את תיק ההשקעות של משקיע ישראלי פרטי ולספק תובנות אסטרטגיות מעשיות.',
    '',
    'כללי ניתוח מחייבים:',
    '1. כל התשובה חייבת להיות בעברית בלבד — מותר רק שמות ניירות ערך באנגלית (BTC, SPY, ETF)',
    '2. כל משפט חייב להכיל מספר ספציפי מהנתונים שסופקו — אין מקום להכללות ריקות',
    '3. המלצות Buy/Sell/Hold מבוססות אך ורק על הנתונים — אין להמציא מידע',
    '4. הפנסיה מושקעת 100% ב-S&P 500 דרך החזקה וירטואלית ב-SPY — התייחס אליה כחשיפה מנייתית ארוכת טווח',
    '5. אין להוסיף כתבי ויתור, הפניות לייעוץ מקצועי, או משפטי זהירות — הלקוח מודע לסיכונים',
    '6. החזר אך ורק אובייקט JSON תקין — ללא markdown, ללא טקסט מחוץ לסוגריים המסולסלים',
  ]

  if (userThesis) {
    lines.push(
      '',
      '=== אסטרטגיית המשקיע — חובה ליישם בכל המלצה ===',
      'המשקיע הגדיר את האסטרטגיה הבאה. כל ניתוח, כל המלצה, וכל קביעת עדיפות חייבים להיות עקביים עם האסטרטגיה הזו.',
      'אל תסתור את האסטרטגיה בשום נסיבות, גם אם הנתונים מצביעים על כיוון אחר — במקרה של סתירה, ציין אותה מפורשות.',
      '',
      userThesis,
    )
  }

  return lines.join('\n')
}

function buildUserPrompt(input: EngineInput): string {
  const { breakdown, totalUsd, ilsPerUsd, holdingsSummary } = input

  const lines: string[] = [
    '=== מצב התיק הנוכחי ===',
    `סה"כ שווי: ${toIls(totalUsd, ilsPerUsd)} | ${fmtUsd(totalUsd)} | שע"ח: 1$ = ₪${ilsPerUsd.toFixed(2)}`,
    '',
    'הקצאת נכסים לפי קטגוריה:',
    `• מזומן / עו"ש (בנק דיסקונט): ${toIls(breakdown.cash, ilsPerUsd)} — ${pct(breakdown.cash, totalUsd)}`,
    `• שוק ההון (אקסלנס טרייד): ${toIls(breakdown.capitalMarket, ilsPerUsd)} — ${pct(breakdown.capitalMarket, totalUsd)}`,
    `• פנסיה (100% S&P 500 / SPY): ${toIls(breakdown.pension, ilsPerUsd)} — ${pct(breakdown.pension, totalUsd)}`,
    `• קריפטו (BTC ועוד): ${toIls(breakdown.crypto, ilsPerUsd)} — ${pct(breakdown.crypto, totalUsd)}`,
  ]

  if (holdingsSummary) {
    lines.push('', '=== פירוט עיקרי החזקות ===', holdingsSummary)
  }

  lines.push(
    '',
    '=== מה אני מבקש ===',
    'נתח את התיק והחזר אובייקט JSON עם המבנה הבא בדיוק:',
    '{',
    '  "summary": "3-4 משפטים — סקירת מצב התיק עם מספרים ספציפיים",',
    '  "allocationAnalysis": "2-3 משפטים — האם ההקצאה בריאה? איפה יש עודף/חסר ביחס לדגם 60/30/10?",',
    '  "pensionCorrelation": "2 משפטים — ביצועי הפנסיה ביחס ל-S&P 500 ואם להגדיל/להקטין הקצאה",',
    '  "recommendations": [',
    '    {',
    '      "type": "קנה",',
    '      "asset": "שם הנכס",',
    '      "rationale": "הסבר קצר מבוסס-נתונים"',
    '    }',
    '  ],',
    '  "monthlyAction": "משפט אחד — הפעולה העיקרית לחודש הקרוב"',
    '}',
    '',
    'כלול בין 2 ל-4 המלצות. כל סוג חייב להיות אחד בדיוק מ: "קנה", "מכור", "החזק".',
  )

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

const VALID_RECOMMENDATION_TYPES = ['קנה', 'מכור', 'החזק'] as const
type ValidRecommendationType = typeof VALID_RECOMMENDATION_TYPES[number]

export async function generatePortfolioInsights(
  input: EngineInput
): Promise<InsightsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      available: false,
      message: 'הגדר ANTHROPIC_API_KEY ב-.env כדי להפעיל ניתוח AI',
    }
  }

  // 20-second hard timeout — cron jobs must never hang waiting for an LLM call.
  // AbortController.signal is passed directly to the Anthropic SDK request options.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: buildSystemPrompt(input.userThesis),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
      },
      { signal: controller.signal }
    )

    const rawText =
      message.content[0]?.type === 'text' ? message.content[0].text : '{}'

    // Strip markdown fences if Claude wraps the JSON despite instructions
    const jsonText = rawText
      .replace(/^```json?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    const parsed = JSON.parse(jsonText) as {
      summary?: string
      allocationAnalysis?: string
      pensionCorrelation?: string
      recommendations?: Array<{ type: string; asset: string; rationale: string }>
      monthlyAction?: string
    }

    // Runtime-validate recommendation types — any hallucinated value is dropped
    const recommendations: PortfolioRecommendation[] = (
      parsed.recommendations ?? []
    )
      .filter((r): r is typeof r & { type: ValidRecommendationType } =>
        VALID_RECOMMENDATION_TYPES.includes(r.type as ValidRecommendationType)
      )
      .map((r) => ({
        type: r.type,
        asset: String(r.asset ?? ''),
        rationale: String(r.rationale ?? ''),
      }))

    // If Claude returned no valid recommendations, add a hold-all fallback
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'החזק',
        asset: 'כלל הנכסים',
        rationale: 'אין שינויים מהותיים מומלצים בשלב זה.',
      })
    }

    return {
      available: true,
      summary: String(parsed.summary ?? ''),
      allocationAnalysis: String(parsed.allocationAnalysis ?? ''),
      pensionCorrelation: String(parsed.pensionCorrelation ?? ''),
      recommendations,
      monthlyAction: String(parsed.monthlyAction ?? ''),
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    console.error(
      `[ai-engine] generatePortfolioInsights ${isTimeout ? 'timed out after 20s' : 'failed'}:`,
      error
    )
    return buildFallback()
  } finally {
    // Always clear the timeout — avoids process-level timer leaks on long-lived
    // Node.js instances (e.g. Next.js dev server with hot reload)
    clearTimeout(timeout)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialisation helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts structured HebrewInsights to a flat text string.
 * Used by the cron job when building the WhatsApp / email body.
 */
export function insightsToText(insights: HebrewInsights): string {
  const recMap: Record<PortfolioRecommendation['type'], string> = {
    קנה: '🟢 קנה',
    מכור: '🔴 מכור',
    החזק: '🟡 החזק',
  }

  const recLines = insights.recommendations.map(
    (r) => `  ${recMap[r.type]} ${r.asset}: ${r.rationale}`
  )

  return [
    insights.summary,
    '',
    '📊 ניתוח הקצאה:',
    insights.allocationAnalysis,
    '',
    '📈 פנסיה ו-S&P 500:',
    insights.pensionCorrelation,
    '',
    '💡 המלצות לחודש:',
    ...recLines,
    '',
    `⭐ פעולה מרכזית: ${insights.monthlyAction}`,
  ].join('\n')
}
