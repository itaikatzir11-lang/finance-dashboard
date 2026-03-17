/**
 * Monthly Reminder System
 *
 * Fetches the current portfolio snapshot, generates Hebrew AI insights
 * via Claude, then dispatches the reminder via WhatsApp (Twilio) and
 * Email (Resend).
 *
 * Required env vars — see /docs or README for details.
 */

// ---------------------------------------------------------------------------
// Portfolio snapshot
// ---------------------------------------------------------------------------

export interface PortfolioSnapshot {
  bankIls: number
  brokerageIls: number
  pensionIls: number
  btcQty: number | null        // null = we only have an ILS balance, not a quantity
  btcPriceUsd: number | null
  btcIls: number
  totalIls: number
  ilsPerUsd: number
}

export async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const { prisma } = await import('@/lib/prisma')
  const { getIlsToUsd } = await import('@/lib/fx-rate')

  const [accounts, ilsToUsd] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      include: { holdings: true },
    }),
    getIlsToUsd(),
  ])

  const usdToIls = 1 / ilsToUsd
  const toIls = (val: number, cur: string) => (cur === 'ILS' ? val : val * usdToIls)

  let bankIls = 0
  let brokerageIls = 0
  let pensionIls = 0
  let btcQty: number | null = null
  let btcPriceUsd: number | null = null
  let btcIls = 0

  for (const acc of accounts) {
    if (acc.type === 'BANK') {
      bankIls += toIls(acc.balance, acc.currency)
    } else if (acc.type === 'BROKERAGE') {
      const holdingsVal = acc.holdings.reduce((s, h) => s + toIls(h.currentValue, h.currency), 0)
      brokerageIls += holdingsVal > 0 ? holdingsVal : toIls(acc.balance, acc.currency)
    } else if (acc.type === 'PENSION') {
      const holdingsVal = acc.holdings.reduce((s, h) => s + toIls(h.currentValue, h.currency), 0)
      pensionIls += holdingsVal > 0 ? holdingsVal : toIls(acc.balance, acc.currency)
    } else if (acc.type === 'CRYPTO') {
      const btcHolding = acc.holdings.find((h) => h.symbol === 'BTC')
      if (btcHolding && btcHolding.quantity > 0) {
        btcQty = btcHolding.quantity
        btcPriceUsd = btcHolding.currentPrice
        btcIls = toIls(btcHolding.currentValue, btcHolding.currency)
      } else {
        btcIls = toIls(acc.balance, acc.currency)
      }
    }
  }

  const totalIls = bankIls + brokerageIls + pensionIls + btcIls

  return {
    bankIls,
    brokerageIls,
    pensionIls,
    btcQty,
    btcPriceUsd,
    btcIls,
    totalIls,
    ilsPerUsd: usdToIls,
  }
}

// ---------------------------------------------------------------------------
// AI insights in Hebrew
// ---------------------------------------------------------------------------

export async function generateHebrewInsights(snap: PortfolioSnapshot): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'ניתוח AI אינו זמין. הגדר ANTHROPIC_API_KEY כדי להפעיל את הניתוח האוטומטי.'

  const pct = (val: number) =>
    snap.totalIls > 0 ? ((val / snap.totalIls) * 100).toFixed(1) : '0.0'

  const btcLine =
    snap.btcQty !== null
      ? `${snap.btcQty.toFixed(4)} BTC (≈ ${ils(snap.btcIls)}) — ${pct(snap.btcIls)}% מהתיק`
      : `${ils(snap.btcIls)} — ${pct(snap.btcIls)}% מהתיק`

  const contextPrompt = [
    `אתה יועץ פיננסי אישי המנתח תיק השקעות של משקיע ישראלי.`,
    `כתוב ניתוח קצר ב-3–4 משפטים בעברית תמציתית עם המלצות ספציפיות לחודש הקרוב.`,
    ``,
    `מצב הפורטפוליו הנוכחי:`,
    `• סה"כ: ${ils(snap.totalIls)}`,
    `• עו"ש (בנק דיסקונט): ${ils(snap.bankIls)} — ${pct(snap.bankIls)}% מהתיק`,
    `• אקסלנס טרייד (מניות): ${ils(snap.brokerageIls)} — ${pct(snap.brokerageIls)}% מהתיק`,
    `• פנסיה (S&P 500 / SPY): ${ils(snap.pensionIls)} — ${pct(snap.pensionIls)}% מהתיק`,
    `• ביטקוין: ${btcLine}`,
    `• שע"ח: 1$ = ₪${snap.ilsPerUsd.toFixed(2)}`,
    ``,
    `התייחס ל:`,
    `1. פיזור נכסים — האם ההקצאה בריאה?`,
    `2. פנסיה עוקבת S&P 500 — האם לשמור על ההקצאה?`,
    `3. ביטקוין — האם לשמור, להגדיל, או לגוון?`,
    `4. נזילות (עו"ש) — האם מספיקה?`,
    ``,
    `סיים עם המלצה עיקרית אחת לחודש הקרוב.`,
  ].join('\n')

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: contextPrompt }],
    })
    return msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : 'ניתוח לא זמין.'
  } catch {
    return 'לא ניתן להפיק ניתוח AI כרגע. אנא בדוק את ANTHROPIC_API_KEY.'
  }
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

function hebrewMonth(): string {
  const months = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ]
  return months[new Date().getMonth()]
}

export function buildReminderMessage(snap: PortfolioSnapshot, insights: string): string {
  const btcLine =
    snap.btcQty !== null
      ? `${snap.btcQty.toFixed(4)} BTC (≈ ${ils(snap.btcIls)})`
      : ils(snap.btcIls)

  return [
    `שלום! 👋 הגיע זמן עדכון חודשי לחודש ${hebrewMonth()} 📊`,
    ``,
    `💰 ערכים נוכחיים במערכת:`,
    `• עו"ש (בנק דיסקונט): ${ils(snap.bankIls)}`,
    `• אקסלנס טרייד: ${ils(snap.brokerageIls)}`,
    `• פנסיה: ${ils(snap.pensionIls)}`,
    `• ביטקוין: ${btcLine}`,
    `• סה"כ: ${ils(snap.totalIls)}`,
    ``,
    `🤖 ניתוח AI לחודש זה:`,
    insights,
    ``,
    `📝 לעדכון הסכומים, פשוט השב/י עם הערכים החדשים, לדוגמה:`,
    `עו"ש: 52,000`,
    `אקסלנס: 135,000`,
    `פנסיה: 215,000`,
    `ביטקוין: 0.45`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export async function sendWhatsApp(message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const to = process.env.REMINDER_WHATSAPP_TO

  if (!accountSid || !authToken || !from || !to) {
    throw new Error(
      'Missing Twilio env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, REMINDER_WHATSAPP_TO'
    )
  }

  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)
  await client.messages.create({ body: message, from, to })
}

export async function sendEmail(message: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.REMINDER_EMAIL_FROM
  const to = process.env.REMINDER_EMAIL_TO

  if (!apiKey || !from || !to) {
    throw new Error(
      'Missing Resend env vars: RESEND_API_KEY, REMINDER_EMAIL_FROM, REMINDER_EMAIL_TO'
    )
  }

  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)

  const htmlBody = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/•/g, '&bull;')

  await resend.emails.send({
    from,
    to,
    subject: `עדכון חודשי — פורטפוליו ${hebrewMonth()} 📊`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
        <h2 style="color:#7c3aed;margin-bottom:16px;">📊 עדכון חודשי — ${hebrewMonth()}</h2>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;line-height:2;">
          ${htmlBody}
        </div>
        <p style="margin-top:20px;color:#6b7280;font-size:13px;">
          השב/י למייל זה עם הסכומים המעודכנים כדי לעדכן את המערכת אוטומטית.
        </p>
      </div>
    `,
  })
}
