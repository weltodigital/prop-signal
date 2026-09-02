import { NextResponse, type NextRequest } from 'next/server'
import { runWeekly } from '@/lib/pipeline/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The batch walks every profile and spends real credits, so it needs room.
export const maxDuration = 800

/**
 * How long the batch may work before it stops and leaves the rest.
 *
 * Short of `maxDuration` on purpose. A run killed by the platform mid-flight
 * leaves a `pipeline_runs` row stuck at 'running', and the next invocation
 * treats that profile as in flight and skips it — so a hard kill does not just
 * lose a run, it loses the profile for the rest of the cycle. Stopping early
 * and cleanly costs one profile's worth of wall clock and avoids all of that.
 */
const BUDGET_MS = 700_000

/**
 * The weekly run. Sunday night into Monday, one profile at a time.
 *
 * Fires repeatedly rather than once, and each invocation picks up the profiles
 * the last one did not reach. A single 800-second request could hold about
 * five subscribers at the old write rate, which was the real ceiling on how
 * many people this product could serve — well below what the credit plan
 * would fund, and about to be five times worse with multi-area plans.
 *
 * Nothing runs twice: a profile with any run row since the cycle opened is
 * skipped, so the repeats drain a queue rather than redoing work.
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
    const { batchId, summaries, remaining } = await runWeekly({ budgetMs: BUDGET_MS })

    return NextResponse.json({
      ok: true,
      batchId,
      profiles: summaries.length,
      // Left for the next invocation. Zero means the cycle is drained.
      remaining,
      creditsSpent: summaries.reduce((total, s) => total + s.creditsSpent, 0),
      dealsSelected: summaries.reduce((total, s) => total + s.dealsSelected, 0),
      thinWeeks: summaries.filter((s) => s.isThin).length,
      failures: summaries.filter((s) => s.status !== 'completed').length,
      // Set when the PropertyData account ran out. The profiles behind it were
      // not attempted and are picked up by the next invocation.
      blockedOnCredits: summaries.some((s) => s.accountBlocked),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(JSON.stringify({ at: 'cron.weekly', event: 'failed', message }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
