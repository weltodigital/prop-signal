'use client'

import { useEffect } from 'react'
import { markWeekSeenAction } from '@/app/dashboard/actions'

/**
 * Clears the unseen marker once the week has actually been looked at.
 *
 * Renders nothing. The marker is cleared on the visit rather than on publish,
 * so a list sitting unread on Monday still says so on Thursday.
 *
 * With JavaScript off this never fires and the week keeps its "new" marking,
 * which is the safe direction to fail: the user is told there is something new
 * for longer than necessary, rather than a fresh list arriving unannounced.
 */
export function MarkSeen({ runId }: { runId: string }) {
  useEffect(() => {
    void markWeekSeenAction(runId)
  }, [runId])

  return null
}
