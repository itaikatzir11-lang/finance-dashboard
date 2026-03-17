import { PrismaClient } from '@prisma/client'

// ── Neon serverless adapter ───────────────────────────────────────────────────
// When DATABASE_URL points to Neon (production on Vercel), use Neon's HTTP
// transport instead of a persistent TCP connection. This prevents the
// "connection timeout" errors that happen when serverless functions try to
// reuse a TCP connection that was closed between invocations.
//
// In local dev (standard postgres://localhost URL) the adapter is skipped
// and a plain PrismaClient is used — no neon account needed locally.
// ─────────────────────────────────────────────────────────────────────────────

function buildClient(): PrismaClient {
  const url = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? ''
  const isNeon = url.includes('neon.tech')

  if (isNeon) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require('@neondatabase/serverless')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } = require('@prisma/adapter-neon')
    const sql = neon(url)
    const adapter = new PrismaNeon(sql)
    return new PrismaClient({ adapter, log: ['error'] })
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? buildClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
