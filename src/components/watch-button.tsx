import { toggleWatchAction } from '@/app/watchlist/actions'

/**
 * The star.
 *
 * A plain form posting to a server function, so it works before any JavaScript
 * has loaded and there is no client bundle behind it. Watching a property reads
 * the diff we already have — it can never cost a credit, and the wording says
 * so rather than leaving the user to wonder.
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
  return (
    <form action={toggleWatchAction} className={className}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        aria-pressed={watched}
        title={watched ? 'Stop watching this property' : 'Watch this property for new events'}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          watched
            ? 'border-accent/30 bg-accent-soft text-accent'
            : 'border-line bg-card text-muted hover:border-accent/30 hover:text-accent'
        }`}
      >
        <span aria-hidden="true">{watched ? '★' : '☆'}</span>
        {watched ? 'Watching' : 'Watch'}
      </button>
    </form>
  )
}
