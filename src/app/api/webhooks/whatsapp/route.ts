/**
 * POST /api/webhooks/whatsapp
 *
 * Twilio WhatsApp inbound webhook.
 * When the user replies to the monthly reminder, Twilio POSTs the message
 * here as URL-encoded form data.
 *
 * The handler:
 *  1. Validates the Twilio request signature (HMAC-SHA1)
 *  2. Ignores messages from unknown numbers
 *  3. Parses the Hebrew reply with Claude
 *  4. Updates the database
 *  5. Responds with a Hebrew TwiML confirmation
 *
 * Configure in Twilio Console:
 *   Messaging → Senders → WhatsApp → [your number] → Inbound webhook:
 *   POST https://yourapp.vercel.app/api/webhooks/whatsapp
 */

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // ── Parse Twilio's URL-encoded body ──────────────────────────────────────
    const bodyText = await request.text()
    const params = new URLSearchParams(bodyText)
    const from = params.get('From') ?? ''
    const messageBody = params.get('Body') ?? ''

    // ── Validate Twilio signature — required in all environments ─────────────
    // If TWILIO_AUTH_TOKEN or APP_URL are missing, reject the request outright.
    // An open webhook endpoint would allow any internet user to modify balances.
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const appUrl = process.env.APP_URL
    if (!authToken || !appUrl) {
      console.error('[webhooks/whatsapp] TWILIO_AUTH_TOKEN or APP_URL is not set — webhook disabled')
      return new Response('Webhook not configured', { status: 503 })
    }

    const signature = request.headers.get('x-twilio-signature') ?? ''
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp`
    const paramsObj: Record<string, string> = {}
    params.forEach((val, key) => { paramsObj[key] = val })

    const twilio = (await import('twilio')).default
    const isValid = twilio.validateRequest(authToken, signature, webhookUrl, paramsObj)
    if (!isValid) {
      console.warn('[webhooks/whatsapp] Invalid Twilio signature from', from)
      return new Response('Forbidden', { status: 403 })
    }

    // ── Only accept messages from the configured number ──────────────────────
    const expectedFrom = process.env.REMINDER_WHATSAPP_TO
    if (expectedFrom && from !== expectedFrom) {
      return twiml('') // Ignore unknown senders
    }

    if (!messageBody.trim()) {
      return twiml('לא קיבלתי הודעה עם סכומים. אנא שלח/י שוב.')
    }

    // ── Parse and apply updates ──────────────────────────────────────────────
    const { parseHebrewReply, applyBalanceUpdates, buildConfirmationMessage } =
      await import('@/lib/reply-parser')

    const updates = await parseHebrewReply(messageBody)
    const applied = await applyBalanceUpdates(updates)
    const confirmation = buildConfirmationMessage(applied)

    return twiml(confirmation)
  } catch (error) {
    console.error('[POST /api/webhooks/whatsapp]', error)
    return twiml('שגיאה בעדכון. אנא נסה/י שוב מאוחר יותר.')
  }
}

function twiml(message: string): Response {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Response>${message ? `<Message>${escapeXml(message)}</Message>` : ''}</Response>`
  return new Response(body, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
