import Link from 'next/link'
import { listNotifications, listWatchlist } from '@/lib/watchlist'
import { requireSubscriber } from '@/lib/require-subscriber'
import { formatBedrooms, formatDate, formatMoney, formatPercent, formatShortDate } from '@/lib/format'
import { AppShell } from '@/components/app-shell'
import { Button, Card, EmptyState } from '@/components/ui'
import { WatchButton } from '@/components/watch-button'
import { markReadAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The watchlist, and what has happened to it.
 *
 * A notification here is a material event on a starred property, observed since
 * the user last looked. Nothing is stored for it and nothing is pushed — it is
 * the weekly diff, read back. Starring costs nothing and never will.
 */
export default async function WatchlistPage() {
  const { email } = await requireSubscriber('/watchlist')
  const [watched, notifications] = await Promise.all([listWatchlist(), listNotifications()])

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
      <p className="mt-2 text-sm text-muted">
        Star a property and anything material that happens to it turns up here. It reads the diff the Sunday run
        already writes, so it costs nothing and never affects your list.
      </p>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-lg font-medium">
            {notifications.length
              ? `${notifications.length} unread ${notifications.length === 1 ? 'event' : 'events'}`
              : 'Nothing unread'}
          </h2>

          {notifications.length ? (
            <form action={markReadAction}>
              <Button type="submit" variant="quiet">
                Mark all as read
              </Button>
            </form>
          ) : null}
        </div>

        {notifications.length ? (
          <div className="mt-4 space-y-3">
            {notifications.map((entry) => (
              <Card key={entry.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-accent">{entry.label}</p>
                    <p className="mt-0.5 text-base">
                      <Link href={`/property/${entry.propertyId}`} className="hover:text-accent">
                        {entry.address ?? 'Address not held'}
                      </Link>
                    </p>
                    {entry.previousPrice !== null && entry.currentPrice !== null ? (
                      <p className="nums mt-0.5 text-sm text-muted">
                        {formatMoney(entry.previousPrice)} to {formatMoney(entry.currentPrice)}
                        {entry.magnitude === null ? '' : `, ${formatPercent(Math.abs(entry.magnitude))}`}
                      </p>
                    ) : null}
                  </div>

                  <p className="text-sm text-muted">Observed {formatShortDate(entry.observedAt)}</p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {watched.length
              ? 'Nothing has moved on your starred properties since you last looked.'
              : 'Nothing is starred yet.'}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">
          {watched.length} {watched.length === 1 ? 'property' : 'properties'} watched
        </h2>

        <div className="mt-4 space-y-3">
          {watched.length === 0 ? (
            <EmptyState title="Nothing starred yet">
              <p>
                The star sits on every property in{' '}
                <Link href="/dashboard" className="underline underline-offset-4 hover:text-ink">
                  this week&rsquo;s list
                </Link>{' '}
                and on its own page. Watching one has no effect on what you are shown each Monday — it only decides
                what turns up here.
              </p>
            </EmptyState>
          ) : (
            watched.map((property) => (
              <Card key={property.propertyId} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-medium">
                      <Link href={`/property/${property.propertyId}`} className="hover:text-accent">
                        {property.address ?? 'Address not held'}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {[property.postcode, formatBedrooms(property.bedrooms), property.propertyType]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="nums mt-1 text-sm">
                      {formatMoney(property.price)}
                      <span className="text-muted"> as at {formatShortDate(property.observedAt)}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Watched since {formatDate(property.watchedSince)}
                      {property.unread.length
                        ? ` · ${property.unread.length} unread ${property.unread.length === 1 ? 'event' : 'events'}`
                        : ''}
                    </p>
                  </div>

                  <WatchButton propertyId={property.propertyId} watched />
                </div>
              </Card>
            ))
          )}
        </div>
      </section>
    </AppShell>
  )
}
