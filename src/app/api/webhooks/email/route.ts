/**
 * POST /api/webhooks/email
 *
 * Inbound email webhook — accepts Postmark's inbound processing format.
 *
 * Setup (Postmark):
 *  1. Create a free Postmark account at postmarkapp.com
 *  2. Go to Default Inbound Stream → Settings → Webhook
 *  3. Set webhook URL:
 *     https://yourapp.vercel.app/api/webhooks/email?secret=<EMAIL_WEBHOOK_SECRET>
 *  4. Postmark gives you an inbound email address (e.g. abc@inbound.postmarkapp.com)
 *  5. Set up an email alias/forward: replies to your reminder email → Postmark address
 *     (or just reply directly to the Postmark inbound address)
 *
 * The handler:
 *  1. Verifies the shared secret in the query string
 *  2. Ignores messages not from the configured email address
 *  3. Parses the Hebrew reply with Claude
 *  4. Updates the database
 *  5. Sends a Hebrew confirmation email back via Resend
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Postmark inbound email payload (we only use what we need)
interface PostmarkInboundPayload {
  From?: string
  TextBody?: string
  StrippedTextReply?: string  // Postmark strips quoted reply content
  Subject?: string
}

export async function POST(request: NextRequest) {
  // ── Verify webhook secret ─────────────────────────────────────────────────
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET
  if (webhookSecret) {
    const url = new URL(request.url)
    if (url.searchParams.get('secret') !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const payload = await request.json() as PostmarkInboundPayload
    const fromEmail = (payload.From ?? '').toLowerCase()

    // ── Only accept replies from our own address ───────────────────────────
    const expectedEmail = process.env.REMINDER_EMAIL_TO?.toLowerCase()
    if (expectedEmail && !fromEmail.includes(expectedEmail.split('@')[0]!)) {
      return NextResponse.json({ ignored: true, reason: 'sender not recognized' })
    }

    // Prefer StrippedTextReply (just the new content) over the full body
    const messageText = payload.StrippedTextReply?.trim() || payload.TextBody?.trim() || ''
    if (!messageText) {
      return NextResponse.json({ ignored: true, reason: 'empty body' })
    }

    // ── Parse and apply updates ────────────────────────────────────────────
    const { parseHebrewReply, applyBalanceUpdates, buildConfirmationMessage } =
      await import('@/lib/reply-parser')

    const updates = await parseHebrewReply(messageText)
    const applied = await applyBalanceUpdates(updates)
    const confirmationText = buildConfirmationMessage(applied)

    // ── Send confirmation email via notifications.ts ──────────────────────
    if (process.env.RESEND_API_KEY && process.env.REMINDER_EMAIL_TO) {
      try {
        const { sendEmailReply } = await import('@/lib/notifications')
        await sendEmailReply(confirmationText)
      } catch (e) {
        // Non-fatal — the DB update succeeded; just log the delivery failure
        console.warn('[webhooks/email] Confirmation email failed:', e)
      }
    }

    return NextResponse.json({ success: true, applied })
  } catch (error) {
    console.error('[POST /api/webhooks/email]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
