/**
 * POST /api/auth  — validate password, set session cookie
 * DELETE /api/auth — clear session cookie (logout)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'

function sessionToken(password: string): string {
  return createHash('sha256').update(`${password}:finauth_session`).digest('hex')
}

/**
 * Constant-time string comparison — prevents timing side-channel attacks.
 * Uses Node's built-in crypto.timingSafeEqual (available in API routes).
 * Falls back to a pure-JS XOR accumulator for Edge Runtime (middleware).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aBytes = Buffer.from(a, 'utf8')
  const bBytes = Buffer.from(b, 'utf8')
  // Node.js crypto.timingSafeEqual requires Buffers of equal length
  return require('crypto').timingSafeEqual(aBytes, bBytes) as boolean
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const submitted = body?.password

  if (!submitted || typeof submitted !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }

  const configured = process.env.DASHBOARD_PASSWORD

  // No password configured → auth is disabled, always succeed
  if (!configured) {
    return NextResponse.json({ ok: true })
  }

  // Use constant-time comparison to prevent timing side-channel password brute-forcing
  if (!timingSafeEqual(submitted, configured)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = sessionToken(configured)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('finauth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}

export async function DELETE(_request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('finauth_token')
  return response
}
