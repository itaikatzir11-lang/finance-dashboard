/**
 * GET  /api/settings/thesis — returns { thesis: string | null, updatedAt: string | null }
 * PATCH /api/settings/thesis — body: { thesis: string | null } — saves or clears the thesis
 * DELETE /api/settings/thesis — clears the thesis
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.userSettings.findUnique({
      where: { id: 'singleton' },
      select: { investmentThesis: true, updatedAt: true },
    })
    return NextResponse.json({
      thesis: row?.investmentThesis ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    })
  } catch {
    return NextResponse.json({ thesis: null, updatedAt: null })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { thesis?: string | null }
    const thesis = body.thesis ?? null

    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.userSettings.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', investmentThesis: thesis },
      update: { investmentThesis: thesis },
    })
    return NextResponse.json({
      thesis: row.investmentThesis,
      updatedAt: row.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('[PATCH /api/settings/thesis]', error)
    return NextResponse.json({ error: 'Failed to save thesis' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.userSettings.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', investmentThesis: null },
      update: { investmentThesis: null },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/settings/thesis]', error)
    return NextResponse.json({ error: 'Failed to clear thesis' }, { status: 500 })
  }
}
