/**
 * Auth middleware — protects all routes when DASHBOARD_PASSWORD is set.
 *
 * If DASHBOARD_PASSWORD is not set in .env, auth is fully disabled and
 * every request passes through. This keeps dev/local usage frictionless.
 *
 * When a password is set, the middleware expects a cookie `finauth_token`
 * whose value is SHA-256("password:finauth_session"). The same hash is
 * computed by POST /api/auth on successful login.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths that are always public (no auth required)
const PUBLIC_PATHS = ['/login', '/api/auth']

async function computeToken(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${password}:finauth_session`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time string comparison — prevents timing side-channel attacks.
 * Accumulates XOR differences across all bytes so the runtime never
 * short-circuits on the first mismatch, leaking no positional information.
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Token is always 64 hex chars; length mismatch leaks no secret.
  if (a.length !== b.length) return false
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // No password configured → auth is disabled, let everything through
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) return NextResponse.next()

  // Public paths always allowed
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Validate the session cookie using a constant-time comparison
  const expected = await computeToken(password)
  const token = request.cookies.get('finauth_token')?.value ?? ''
  if (timingSafeEqual(token, expected)) return NextResponse.next()

  // API routes get a JSON 401 — no HTML redirect (cleaner for API clients)
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Page routes — redirect to login, preserving the original destination
  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Run on all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
}
