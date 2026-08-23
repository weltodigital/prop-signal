import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createPropertyDataClient } from './client'
import { PropertyDataError } from './errors'

/**
 * Checks which sourcing list ids the live API actually accepts.
 *
 * PropertyData's documentation names five lists by way of example and does not
 * publish the rest. Rather than guess a slug and let a paying subscriber
 * discover it does not exist, `strategy_lists` carries the candidates disabled
 * and this confirms them.
 *
 * It spends real credits — one per ten results returned, so roughly one per
 * list — and so it goes through the wrapper like everything else, recorded
 * against the operator's own account.
 */

export type ProbeResult = {
  id: string
  label: string
  accepted: boolean
  results: number
  credits: number
  reason: string | null
}

/** Dense enough that a real list returns something and an empty result means the id is wrong. */
const PROBE_POSTCODE = 'M1 1AE'
const PROBE_RADIUS = 40

export async function probeStrategyLists(options: {
  ownerId: string
  /** Leave false to see what would be probed without spending anything. */
  spend: boolean
  /** Probe only these ids. Defaults to every row in strategy_lists. */
  only?: string[]
}): Promise<ProbeResult[]> {
  const admin = createAdminClient()

  const { data: lists, error } = await admin
    .from('strategy_lists')
    .select('id, label, enabled, verified_at')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Could not read strategy_lists: ${error.message}`)

  const candidates = (lists ?? []).filter((row) => !options.only || options.only.includes(row.id))

  if (!options.spend) {
    return candidates.map((row) => ({
      id: row.id,
      label: row.label,
      accepted: row.verified_at !== null,
      results: 0,
      credits: 0,
      reason: 'not probed',
    }))
  }

  // One credit per list is the expected cost. The ceiling is generous enough
  // for a surprise and small enough that a bug cannot run away.
  const client = createPropertyDataClient({
    ownerId: options.ownerId,
    runCreditCeiling: Math.max(10, candidates.length * 2),
  })

  const results: ProbeResult[] = []

  for (const row of candidates) {
    try {
      const response = await client.call<{ properties?: unknown[] }>(
        'sourced-properties',
        { list: row.id, postcode: PROBE_POSTCODE, radius: PROBE_RADIUS, results: 10 },
        { forceRefresh: true },
      )

      const count = Array.isArray(response.data.properties) ? response.data.properties.length : 0

      results.push({
        id: row.id,
        label: row.label,
        // A valid list in Manchester within 40 miles returns something. Zero
        // results is treated as unconfirmed rather than as proof either way.
        accepted: count > 0,
        results: count,
        credits: response.credits,
        reason: count > 0 ? null : 'accepted the id but returned nothing',
      })
    } catch (caught) {
      const error = caught instanceof PropertyDataError ? caught : null

      results.push({
        id: row.id,
        label: row.label,
        accepted: false,
        results: 0,
        credits: 0,
        reason: error ? `${error.code ?? error.httpStatus ?? 'error'}: ${error.message}` : String(caught),
      })

      // An account-level failure means nothing further will work.
      if (client.abortedReason()) break
    }
  }

  const confirmed = results.filter((r) => r.accepted).map((r) => r.id)

  if (confirmed.length) {
    const { error: updateError } = await admin
      .from('strategy_lists')
      .update({ verified_at: new Date().toISOString(), enabled: true })
      .in('id', confirmed)

    if (updateError) throw new Error(`Could not record the verified lists: ${updateError.message}`)
  }

  // A list that used to work and now does not is taken off the form rather than
  // left to fail in the middle of a Sunday run.
  const rejected = results.filter((r) => !r.accepted && r.reason?.includes('X')).map((r) => r.id)

  if (rejected.length) {
    await admin.from('strategy_lists').update({ enabled: false, verified_at: null }).in('id', rejected)
  }

  return results
}
