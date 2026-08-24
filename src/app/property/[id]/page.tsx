import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPropertyDetail } from '@/lib/deals'
import { requireSubscriber } from '@/lib/require-subscriber'
import { markReadAction } from '@/app/watchlist/actions'
import { formatBedrooms, formatDate, formatListName, formatMoney, formatShortDate } from '@/lib/format'
import { AppShell } from '@/components/app-shell'
import { Button, Card } from '@/components/ui'
import { RiskFlags } from '@/components/risk-flags'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { StackedNumbers } from '@/components/stacked-numbers'
import { StackIt } from '@/components/stack-it'
import { Timeline } from '@/components/timeline'
import { WatchButton } from '@/components/watch-button'

export const dynamic = 'force-dynamic'

/**
 * One property, in full.
 *
 * The timeline is the point of the page: the complete event history, every
 * entry dated by when the data behind it was observed. Underneath it, the
 * workings — the score line by line, and a calculator that runs in the browser
 * so the user can put their own numbers through it for nothing.
 */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { email } = await requireSubscriber(`/property/${id}`)

  // Scoped by row level security, so another subscriber's property is not found
  // rather than forbidden.
  const property = await getPropertyDetail(id)
  if (!property) notFound()

  const priceRange =
    property.lowestPriceSeen !== null &&
    property.highestPriceSeen !== null &&
    property.lowestPriceSeen !== property.highestPriceSeen

  return (
    <AppShell email={email}>
      <p className="text-sm text-muted">
        <Link href="/dashboard" className="underline underline-offset-4 hover:text-ink">
          This week
        </Link>
      </p>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{property.address ?? 'Address not held'}</h1>
          <p className="mt-1 text-sm text-muted">
            {[property.postcode, formatBedrooms(property.bedrooms), property.propertyType].filter(Boolean).join(' · ')}
          </p>
          {property.preciseAddress ? <p className="mt-1 text-sm text-muted">{property.preciseAddress}</p> : null}
        </div>

        <WatchButton propertyId={property.propertyId} watched={property.watched} />
      </div>

      <p className="mt-3 text-sm text-muted">
        First observed {formatDate(property.firstObservedAt)}, last seen {formatDate(property.observedAt)}.
        {priceRange
          ? ` Between ${formatMoney(property.lowestPriceSeen)} and ${formatMoney(property.highestPriceSeen)} over that time.`
          : ''}
      </p>

      {property.lists.length ? (
        <p className="mt-3 flex flex-wrap gap-2">
          {property.lists.map((list) => (
            <span key={list} className="rounded-full border border-line px-2.5 py-0.5 text-sm text-muted">
              {formatListName(list)}
            </span>
          ))}
        </p>
      ) : null}

      <section className="mt-8">
        <Card>
          <StackedNumbers property={property} />

          {property.latest?.epc || property.latest?.councilTaxBand ? (
            <p className="mt-3 text-sm text-muted">
              {property.latest.epc
                ? `EPC ${property.latest.epc.rating}${property.latest.epc.score === null ? '' : ` (${property.latest.epc.score})`}`
                : null}
              {property.latest.epc && property.latest.councilTaxBand ? ' · ' : null}
              {property.latest.councilTaxBand ? `Council tax band ${property.latest.councilTaxBand}` : null}
              <span> — matched to this address when it was last published.</span>
            </p>
          ) : null}

          {property.latest ? <RiskFlags risks={property.latest.risks} /> : null}

          <div className="mt-5 border-t border-line pt-4 text-sm">
            {property.listingUrl ? (
              <a
                href={property.listingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-accent"
              >
                View the original listing
              </a>
            ) : (
              <span className="text-muted">No link to the advert was held</span>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-lg font-medium">Timeline</h2>
          {property.watched ? (
            <form action={markReadAction}>
              <input type="hidden" name="propertyId" value={property.propertyId} />
              <Button type="submit" variant="quiet">
                Mark this one as read
              </Button>
            </form>
          ) : null}
        </div>

        <p className="mt-1 text-sm text-muted">
          Every entry is dated when the data behind it was observed. A filled marker is an event material enough to
          put the property back in front of you on its own.
        </p>

        <Timeline entries={property.events} />
      </section>

      {property.appearances.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">When you were shown this</h2>
          <p className="mt-1 text-sm text-muted">
            A property returns only on the strength of a move it has not already been shown for.
          </p>

          <ul className="mt-3 space-y-2">
            {property.appearances.map((appearance) => (
              <li key={appearance.runId} className="flex flex-wrap items-baseline justify-between gap-x-6 text-sm">
                <span>
                  <Link
                    href={`/archive/${appearance.runId}`}
                    className="underline underline-offset-4 hover:text-accent"
                  >
                    {appearance.weekOf ? `Week of ${formatShortDate(appearance.weekOf)}` : 'Opening list'}
                  </Link>
                  <span className="text-muted"> — {appearance.headline}</span>
                </span>
                <span className="nums text-muted">
                  Position {appearance.position}, score {appearance.totalScore.toFixed(0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {property.latest ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">How it scored</h2>
          <p className="mt-1 text-sm text-muted">
            From the last time it was published to you, on the figures held then and under the weights in force then.
          </p>
          <Card className="mt-3">
            <ScoreBreakdown
              quality={property.latest.qualityFactors}
              movement={property.latest.movementFactors}
              qualityScore={property.latest.qualityScore}
              movementScore={property.latest.movementScore}
              version={property.latest.scoreVersion}
            />
          </Card>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Stack it</h2>
        <p className="mt-1 text-sm text-muted">
          Runs in your browser against the figures above. Change anything you like — it costs nothing and nothing is
          saved.
          {property.enrichment.estimatedRent === null || property.price === null
            ? ' Some figures are not held, so those boxes start empty rather than at a guess.'
            : ''}
        </p>

        <Card className="mt-3">
          <StackIt
            askingPrice={property.price}
            estimatedRent={property.enrichment.estimatedRent}
            estimatedValue={property.enrichment.estimatedValue}
          />
        </Card>
      </section>
    </AppShell>
  )
}
