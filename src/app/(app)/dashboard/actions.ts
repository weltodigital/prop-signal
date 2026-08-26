'use server'

import { createClient } from '@/lib/supabase/server'
import { markWeekSeen } from '@/lib/deals'

/**
 * Clears the unseen marker on a published week.
 *
 * A server function rather than a write during render: pages render more than
 * once and may be prerendered, and `after()` in a Server Component cannot read
 * cookies, which is what binds the write to the signed-in user. Here the
 * cookie-bound client applies row level security as usual, and
 * `weekly_selections.seen_at` is the only column a subscriber may write.
 */
export async function markWeekSeenAction(runId: string): Promise<void> {
  if (!runId) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await markWeekSeen(runId)
}
