/**
 * Outbound Notifications
 *
 * Resend (Email) and Twilio (WhatsApp) clients in one place.
 * Both functions are fire-and-forget safe — they throw on failure
 * so callers can catch and record the error without crashing.
 *
 * Required environment variables
 * ───────────────────────────────
 * WhatsApp (Twilio):
 *   TWILIO_ACCOUNT_SID      — Account SID from console.twilio.com
 *   TWILIO_AUTH_TOKEN       — Auth token from console.twilio.com
 *   TWILIO_WHATSAPP_FROM    — Sender in the form whatsapp:+14155238886
 *   REMINDER_WHATSAPP_TO    — Recipient: whatsapp:+972501234567
 *
 * Email (Resend):
 *   RESEND_API_KEY          — API key from resend.com
 *   REMINDER_EMAIL_FROM     — Verified sender address
 *   REMINDER_EMAIL_TO       — Recipient address
 *
 * Both channels are optional — if the env vars are absent, the function
 * throws with a descriptive message so the cron job can log "skipped"
 * rather than a cryptic error.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function currentHebrewMonth(): string {
  return HEBREW_MONTHS[new Date().getMonth()]
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp via Twilio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a plain-text WhatsApp message via the Twilio API.
 *
 * Twilio's WhatsApp sandbox accepts messages up to ~1600 characters.
 * Production-approved templates have no length limit.
 *
 * Throws if any required env var is missing or if the Twilio API call fails.
 */
export async function sendWhatsApp(body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM
  const to         = process.env.REMINDER_WHATSAPP_TO

  if (!accountSid || !authToken || !from || !to) {
    throw new Error(
      'Missing Twilio env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
      'TWILIO_WHATSAPP_FROM, REMINDER_WHATSAPP_TO'
    )
  }

  // Dynamic import keeps the Twilio SDK out of the initial bundle —
  // it's only loaded when this function is actually called.
  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  await client.messages.create({ body, from, to })
}

// ─────────────────────────────────────────────────────────────────────────────
// Email via Resend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a plain-text message as a styled Hebrew RTL email via Resend.
 *
 * The HTML template:
 *   - Sets dir="rtl" on the outer container for proper Hebrew rendering
 *   - Converts newlines → <br> and • → &bull;
 *   - Wraps in a minimal inline-styled card (no external CSS dependencies)
 *
 * Throws if any required env var is missing or if the Resend API call fails.
 */
export async function sendEmail(body: string, subject?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.REMINDER_EMAIL_FROM
  const to     = process.env.REMINDER_EMAIL_TO

  if (!apiKey || !from || !to) {
    throw new Error(
      'Missing Resend env vars: RESEND_API_KEY, REMINDER_EMAIL_FROM, REMINDER_EMAIL_TO'
    )
  }

  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)

  const month = currentHebrewMonth()
  const emailSubject = subject ?? `עדכון חודשי — פורטפוליו ${month} 📊`

  // Escape HTML entities, then convert whitespace formatting
  const htmlBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/•/g, '&bull;')
    .replace(/☐/g, '&#9744;')   // unchecked ballot box
    .replace(/✅/g, '&#9989;')
    .replace(/🤖/g, '&#129302;')
    .replace(/📊/g, '&#128202;')
    .replace(/💰/g, '&#128176;')
    .replace(/📋/g, '&#128203;')
    .replace(/📝/g, '&#128221;')
    .replace(/⭐/g, '&#11088;')
    .replace(/🟢/g, '&#129002;')
    .replace(/🔴/g, '&#128308;')
    .replace(/🟡/g, '&#129001;')
    .replace(/📈/g, '&#128200;')
    .replace(/💡/g, '&#128161;')

  await resend.emails.send({
    from,
    to,
    subject: emailSubject,
    html: `
      <div dir="rtl" lang="he"
           style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto;
                  padding: 24px; color: #111; background: #fff;">
        <h2 style="color: #7c3aed; margin-bottom: 16px; font-size: 20px;">
          📊 עדכון חודשי — ${month}
        </h2>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb;
                    border-radius: 8px; padding: 20px; line-height: 2;
                    font-size: 15px; white-space: pre-wrap;">
          ${htmlBody}
        </div>
        <p style="margin-top: 20px; color: #6b7280; font-size: 13px; line-height: 1.6;">
          השב/י להודעת הוואטסאפ או למייל זה עם הסכומים המעודכנים כדי לעדכן את המערכת אוטומטית.
        </p>
        <p style="color: #d1d5db; font-size: 11px; margin-top: 8px;">
          נוצר אוטומטית על ידי FinDash · ${new Date().toLocaleDateString('he-IL')}
        </p>
      </div>
    `,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Acknowledgment message (inbound webhook reply)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a short confirmation reply back to the user.
 * Used by inbound webhooks after successfully parsing and applying an update.
 */
export async function sendWhatsAppReply(body: string): Promise<void> {
  return sendWhatsApp(body)
}

export async function sendEmailReply(body: string, subject?: string): Promise<void> {
  return sendEmail(body, subject ?? 'אישור עדכון — FinDash ✅')
}
