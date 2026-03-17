/**
 * user-settings.ts
 *
 * Thin helpers for reading and writing the single UserSettings row.
 * Uses a fixed id ("singleton") so there is always at most one row.
 *
 * Both functions are safe to call without an existing row:
 *   getInvestmentThesis() → null if no row yet
 *   saveInvestmentThesis() → creates the row on first call (upsert)
 */

const SETTINGS_ID = 'singleton'

export async function getInvestmentThesis(): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.userSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { investmentThesis: true },
    })
    return row?.investmentThesis ?? null
  } catch {
    return null
  }
}

export async function saveInvestmentThesis(thesis: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma')
  await prisma.userSettings.upsert({
    where:  { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, investmentThesis: thesis },
    update: { investmentThesis: thesis },
  })
}

export async function clearInvestmentThesis(): Promise<void> {
  const { prisma } = await import('@/lib/prisma')
  await prisma.userSettings.upsert({
    where:  { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, investmentThesis: null },
    update: { investmentThesis: null },
  })
}

// ---------------------------------------------------------------------------
// Rate-limit helpers — persist last-called timestamps in the DB so the
// cooldown survives serverless cold starts.
//
// When the DB is unavailable, a module-level fallback timestamp is used so
// the rate limit still applies (instead of silently allowing everything).
// The module-level variable resets on cold start, but that's an acceptable
// trade-off vs. completely disabling the limit during an outage.
// ---------------------------------------------------------------------------

// Module-level fallback timestamps (used when DB is unreachable)
let _lastSyncFallback = 0
let _lastAiInsightFallback = 0

function checkCooldown(lastMs: number, cooldownMs: number): { allowed: boolean; retryAfter: number } {
  if (lastMs > 0) {
    const elapsed = Date.now() - lastMs
    if (elapsed < cooldownMs) {
      return { allowed: false, retryAfter: Math.ceil((cooldownMs - elapsed) / 1000) }
    }
  }
  return { allowed: true, retryAfter: 0 }
}

export async function checkAndSetSyncRateLimit(cooldownMs: number): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.userSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { lastSyncAt: true },
    })
    const check = checkCooldown(row?.lastSyncAt?.getTime() ?? 0, cooldownMs)
    if (!check.allowed) return check
    await prisma.userSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastSyncAt: new Date() },
      update: { lastSyncAt: new Date() },
    })
    _lastSyncFallback = Date.now()
    return { allowed: true, retryAfter: 0 }
  } catch {
    // DB unavailable — fall back to module-level timestamp
    const check = checkCooldown(_lastSyncFallback, cooldownMs)
    if (!check.allowed) return check
    _lastSyncFallback = Date.now()
    return { allowed: true, retryAfter: 0 }
  }
}

export async function checkAndSetAiInsightRateLimit(cooldownMs: number): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.userSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { lastAiInsightAt: true },
    })
    const check = checkCooldown(row?.lastAiInsightAt?.getTime() ?? 0, cooldownMs)
    if (!check.allowed) return check
    await prisma.userSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastAiInsightAt: new Date() },
      update: { lastAiInsightAt: new Date() },
    })
    _lastAiInsightFallback = Date.now()
    return { allowed: true, retryAfter: 0 }
  } catch {
    // DB unavailable — fall back to module-level timestamp
    const check = checkCooldown(_lastAiInsightFallback, cooldownMs)
    if (!check.allowed) return check
    _lastAiInsightFallback = Date.now()
    return { allowed: true, retryAfter: 0 }
  }
}
