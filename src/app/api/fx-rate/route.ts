/**
 * GET /api/fx-rate
 * Returns the current ILS→USD exchange rate for use by client components.
 */
import { NextResponse } from 'next/server'
import { getIlsToUsd, getFxRateMeta } from '@/lib/fx-rate'

export async function GET() {
  const rate = await getIlsToUsd()
  const meta = getFxRateMeta()
  return NextResponse.json({
    ilsToUsd: rate,
    rate,
    source: meta.source,
    cachedAt: meta.cachedAt,
  })
}
