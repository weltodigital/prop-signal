import Link from 'next/link'
import type { SearchProfile } from '@/lib/search-profile.types'
import { areaName } from '@/lib/search-profile.types'

/**
 * Which area the dashboard is showing.
 *
 * Renders nothing for a subscriber with one, which is every subscriber until
 * the tiers ship — so this costs a single-area account nothing at all.
 *
 * Deliberately a switcher rather than a merge. A Manchester HMO and a
 * Portsmouth flat have not been ranked against each other and could not
 * usefully be: the strategy return is a percentile within an area's own
 * history, so a combined list would be ordering two scales against each other
 * and calling the result a ranking. Each area keeps its own list, its own
 * score scale, and its own week.
 */
export function AreaSwitcher({
  profiles,
  current,
}: {
  /** Every area, paused ones included. */
  profiles: SearchProfile[]
  current: SearchProfile
}) {
  if (profiles.length < 2) return null

  return (
    <nav aria-label="Your areas" className="mt-4 flex flex-wrap items-center gap-2">
      {profiles.map((profile) => {
        const isCurrent = profile.id === current.id
        const paused = profile.pausedAt !== null

        return (
          <Link
            key={profile.id}
            href={`/dashboard?area=${profile.id}`}
            aria-current={isCurrent ? 'page' : undefined}
            title={paused ? (profile.pausedReason ?? 'Paused — your plan does not cover this area') : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              isCurrent
                ? 'border-highlight-deep/40 bg-card font-medium text-highlight-deep'
                : 'border-line text-muted hover:border-highlight-deep/40 hover:text-ink'
            } ${paused ? 'opacity-60' : ''}`}
          >
            {areaName(profile)}
            {paused ? <span className="label ml-2 text-muted">Paused</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
