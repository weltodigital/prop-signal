'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleWatchAction } from '@/app/(app)/watchlist/actions'

/**
 * The star.
 *
 * It used to be a plain form posting to a server function, which meant a full
 * round trip and a re-render before anything on screen changed. Starring is a
 * decision somebody makes in half a second and it felt like the app had not
 * heard them.
 *
 * The state flips immediately and the write happens behind it. React reconciles
 * when the action returns, so if the write fails the star goes back on its own.
 * Watching a property reads the diff we already have and can never cost a
 * credit, which is why the risk of showing it as done first is worth taking.
 */
export function WatchButton({
  propertyId,
  watched,
  className = '',
}: {
  propertyId: string
  watched: boolean
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(watched)

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      title={optimistic ? 'Stop watching this property' : 'Watch this property for new events'}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic)
          const data = new FormData()
          data.set('propertyId', propertyId)
          await toggleWatchAction(data)
        })
      }
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        optimistic
          ? 'border-accent/30 bg-accent-soft text-accent'
          : 'border-line bg-card text-muted hover:border-accent/30 hover:text-accent'
      } ${pending ? 'opacity-70' : ''} ${className}`}
    >
      <span aria-hidden="true" className={optimistic ? 'scale-110 transition-transform' : 'transition-transform'}>
        {optimistic ? '★' : '☆'}
      </span>
      {optimistic ? 'Watching' : 'Watch'}
    </button>
  )
}
