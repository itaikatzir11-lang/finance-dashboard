/**
 * GET /api/status
 *
 * Returns the live connection status of all data sources.
 * Reads BTC address from DB (when env BTC_ADDRESS is not set) so the
 * Connections page reflects addresses configured via the app UI.
 *
 * The full BTC address is used server-side only for API reachability checks.
 * It is never included in the response.
 */

import { NextResponse } from 'next/server'
import { getDataSourceStatuses, summarizeStatuses } from '@/lib/adapters/registry'

export async function GET() {
  try {
    // Read BTC address from DB so UI-configured addresses are reflected in status.
    // env BTC_ADDRESS takes priority inside getDataSourceStatuses.
    let btcAddressFromDb: string | null = null

    if (!process.env.BTC_ADDRESS) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const cryptoAccount = await prisma.account.findFirst({
          where: { type: 'CRYPTO', isActive: true },
          select: { metadata: true },
        })
        const meta = cryptoAccount?.metadata as Record<string, unknown> | null
        btcAddressFromDb = (meta?.btcAddress as string | undefined) ?? null
      } catch {
        // DB not available — status page still works, shows manual mode
      }
    }

    const sources = await getDataSourceStatuses({ btcAddressFromDb })
    const summary = summarizeStatuses(sources)

    return NextResponse.json({
      sources,
      summary,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[/api/status]', error)
    return NextResponse.json(
      { error: 'Failed to check data source status' },
      { status: 500 }
    )
  }
}
