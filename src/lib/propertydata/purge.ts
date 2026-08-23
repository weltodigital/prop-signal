import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Deletes stored PropertyData payloads that have expired, and anything over 60
 * days old whatever its expiry claims.
 *
 * Runs on a schedule and is safe to run by hand at any time. Derived material —
 * events, scores, aggregates — is untouched: it is a dated historical
 * observation, not an answer about the present, and it is kept.
 */
export async function purgeExpiredPayloads(supabase: SupabaseClient = createAdminClient()): Promise<number> {
  const { data, error } = await supabase.rpc('purge_expired_api_cache')

  if (error) throw new Error(`Purge failed: ${error.message}`)

  const removed = typeof data === 'number' ? data : 0
  console.log(JSON.stringify({ at: 'propertydata', event: 'purge_complete', rows_removed: removed }))
  return removed
}
