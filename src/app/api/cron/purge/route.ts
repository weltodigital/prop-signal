import { NextResponse, type NextRequest } from 'next/server'
import { purgeExpiredPayloads } from '@/lib/propertydata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Deletes expired PropertyData payloads. Runs daily on Vercel Cron.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Anything without it is
 * refused, so the endpoint cannot be triggered by a stranger.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  try {
    const removed = await purgeExpiredPayloads()
    return NextResponse.json({ ok: true, rowsRemoved: removed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(JSON.stringify({ at: 'cron.purge', event: 'failed', message }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
