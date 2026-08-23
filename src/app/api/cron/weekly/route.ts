import { NextResponse, type NextRequest } from 'next/server'
import { runWeekly } from '@/lib/pipeline/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The batch walks every profile and spends real credits, so it needs room.
export const maxDuration = 800

/**
 * The weekly run. Sunday 22:00, one cron.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Anything without it is
 * refused — this endpoint spends money.
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
    const { batchId, summaries } = await runWeekly()

    return NextResponse.json({
      ok: true,
      batchId,
      profiles: summaries.length,
      creditsSpent: summaries.reduce((total, s) => total + s.creditsSpent, 0),
      dealsSelected: summaries.reduce((total, s) => total + s.dealsSelected, 0),
      thinWeeks: summaries.filter((s) => s.isThin).length,
      failures: summaries.filter((s) => s.status !== 'completed').length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(JSON.stringify({ at: 'cron.weekly', event: 'failed', message }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
