/**
 * /api/accounts/[id]/btc-address
 *
 * PUT  – Set a watch-only BTC address on a crypto account.
 *        Validates format before writing. Returns masked version only.
 *
 * DELETE – Clear the BTC address, returning the account to manual mode.
 *
 * Privacy contract:
 *   - Full address is stored in DB (account.metadata.btcAddress)
 *   - Full address is NEVER returned in any response
 *   - Full address is NEVER logged (only masked version is logged)
 *   - env BTC_ADDRESS always takes precedence over DB for actual syncing,
 *     but the DB value is used when env is not set
 *
 * Future encryption:
 *   To add field-level encryption, wrap the btcAddress value with an
 *   encrypt() call before the DB write and decrypt() before reading.
 *   The API surface here does not need to change.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidBTCAddress, maskBTCAddress, sanitizeAccountMetadata } from '@/lib/btc-address'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { address } = body as { address?: string }

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      )
    }

    const trimmed = address.trim()

    if (!isValidBTCAddress(trimmed)) {
      return NextResponse.json(
        {
          error: 'Invalid BTC address format.',
          hint: 'Supported formats: bc1q... (native SegWit), bc1p... (Taproot), 1... (legacy), 3... (P2SH)',
        },
        { status: 422 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    const account = await prisma.account.findUnique({ where: { id: params.id } })

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    if (account.type !== 'CRYPTO') {
      return NextResponse.json(
        { error: 'BTC address can only be set on CRYPTO accounts' },
        { status: 400 }
      )
    }

    const existingMeta = (account.metadata ?? {}) as Record<string, unknown>

    const updated = await prisma.account.update({
      where: { id: params.id },
      data: {
        metadata: {
          ...existingMeta,
          btcAddress: trimmed,          // stored full, never returned
          watchOnly: true,
        },
      },
    })

    // Log only the masked version
    console.info(
      `[btc-address] SET on account ${params.id}: ${maskBTCAddress(trimmed)}`
    )

    return NextResponse.json({
      success: true,
      mode: 'watch-only',
      btcAddressMasked: maskBTCAddress(trimmed),
      metadata: sanitizeAccountMetadata(updated.metadata as Record<string, unknown>),
    })
  } catch (error) {
    console.error('[btc-address] PUT error:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Failed to save BTC address' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { prisma } = await import('@/lib/prisma')

    const account = await prisma.account.findUnique({ where: { id: params.id } })

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const existingMeta = (account.metadata ?? {}) as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { btcAddress: _removed, ...metaWithoutAddress } = existingMeta as {
      btcAddress?: string
      [k: string]: unknown
    }

    const updated = await prisma.account.update({
      where: { id: params.id },
      data: {
        metadata: {
          ...metaWithoutAddress,
          watchOnly: false,
        },
      },
    })

    console.info(`[btc-address] CLEARED on account ${params.id} — reverting to manual mode`)

    return NextResponse.json({
      success: true,
      mode: 'manual',
      metadata: sanitizeAccountMetadata(updated.metadata as Record<string, unknown>),
    })
  } catch (error) {
    console.error('[btc-address] DELETE error:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Failed to remove BTC address' }, { status: 500 })
  }
}
