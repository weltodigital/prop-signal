/**
 * Runs the weekly pipeline by hand.
 *
 *   pnpm run:weekly                          # every subscriber
 *   pnpm run:weekly --owner <uuid>           # one of them
 *   pnpm run:weekly --dry                    # list what would run, spend nothing
 *
 * Does exactly what the Sunday cron does. It spends real credits.
 */
import './load-env'
import { createClient } from '@supabase/supabase-js'
import { runWeekly } from '../src/lib/pipeline/run'

async function main() {
  const args = process.argv.slice(2)
  const ownerIndex = args.indexOf('--owner')
  const ownerId = ownerIndex >= 0 ? args[ownerIndex + 1] : undefined
  const dry = args.includes('--dry')

  if (dry) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let query = admin
      .from('search_profiles')
      .select('owner_id, postcode, radius_miles, strategies, backfill_completed_at')
    if (ownerId) query = query.eq('owner_id', ownerId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    console.log(`${data?.length ?? 0} profile${data?.length === 1 ? '' : 's'} would run. Nothing was spent.\n`)
    for (const profile of data ?? []) {
      const kind = profile.backfill_completed_at === null ? 'backfill' : 'weekly'
      console.log(
        `  ${profile.owner_id}  ${profile.postcode.padEnd(9)} ${String(profile.radius_miles).padStart(2)}mi  ${kind.padEnd(8)} ${profile.strategies.join(', ')}`,
      )
    }
    return
  }

  const { batchId, summaries } = await runWeekly({ ownerId })

  console.log(`\nBatch ${batchId}\n`)
  for (const summary of summaries) {
    console.log(
      `  ${summary.ownerId}  ${summary.kind.padEnd(8)} ${summary.status.padEnd(9)} ` +
        `${String(summary.candidatesSeen).padStart(4)} seen  ` +
        `${String(summary.eventsWritten).padStart(3)} events  ` +
        `${String(summary.dealsSelected).padStart(2)} published  ` +
        `${String(summary.creditsSpent).padStart(3)} credits` +
        (summary.isThin ? '  (thin week)' : '') +
        (summary.error ? `\n      ${summary.error}` : ''),
    )
  }

  const credits = summaries.reduce((total, s) => total + s.creditsSpent, 0)
  const failures = summaries.filter((s) => s.status !== 'completed').length

  console.log(`\n${summaries.length} profiles, ${credits} credits, ${failures} failures.`)
  if (failures) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
