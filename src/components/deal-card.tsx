import Link from 'next/link'
import type { PublishedDeal } from '@/lib/deals'
import { formatBedrooms, formatMoney, NOT_HELD } from '@/lib/format'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { StackedNumbers } from '@/components/stacked-numbers'
import { RiskFlags } from '@/components/risk-flags'
import { StageControl } from '@/components/stage-control'
import { setStageAction } from '@/app/(app)/deals/actions'
import { directListingUrl, listingPortal } from '@/lib/listing-url'
import type { DealStage } from '@/lib/deal-stages'
import { WatchButton } from '@/components/watch-button'

/**
 * A published deal, as one scannable row.
 *
 * A list is read by running an eye down it, so the card carries only what
 * decides whether to stop: why it is here, what it is, what it costs, what it
 * earns, and the score. Everything else — the full figures, the EPC, the
 * workings — is one click down, where somebody who has already stopped will
 * look for it.
 *
 * There is never a photograph. Listing images carry no rights, so we link to
 * the advert and describe the property in words.
 */

/**
 * One figure, on the same line as the others.
 *
 * A grid gave every figure a label above it and a note below, which reserved
 * three lines of height whether or not there was anything to put on two of
 * them. Inline, the label sits beside the value and the row costs one line.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-xs text-muted">{label}</span>
      <span className="nums font-medium">{value}</span>
    </span>
  )
}

/**
 * The score, weighted by how good it is.
 *
 * Out of 150, so the thresholds are not the usual percentage ones. A number
 * alone makes every row look the same at a glance; the weight is what lets an
 * eye running down the list stop in the right place.
 */
function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 100
      ? 'border-accent bg-accent text-white'
      : score >= 75
        ? 'border-accent/30 bg-accent-soft text-accent'
        : 'border-line bg-paper text-muted'

  return (
    <span
      className={`nums inline-flex h-9 min-w-[2.75rem] items-center justify-center rounded-md border px-2 text-base font-semibold ${tone}`}
      title={`${score.toFixed(1)} out of 150`}
    >
      {score.toFixed(0)}
    </span>
  )
}

export function DealCard({
  deal,
  isNew = false,
  stage = null,
}: {
  deal: PublishedDeal
  isNew?: boolean
  /** Where this one got to, where the subscriber has started tracking it. */
  stage?: DealStage | null
}) {
  const winner = deal.strategyScores.find((s) => s.strategy === deal.winningStrategy) ?? null
  const runnersUp = deal.strategyScores
    .filter((s) => s.strategy !== deal.winningStrategy)
    .sort((a, b) => b.total - a.total)

  const perSqFt =
    deal.price && deal.internalAreaSqFt ? `£${Math.round(deal.price / deal.internalAreaSqFt)} per sq ft` : null

  const grossYield =
    deal.price && deal.enrichment.estimatedRent
      ? `${(((deal.enrichment.estimatedRent * 12) / deal.price) * 100).toFixed(1)}% gross`
      : null

  return (
    <article className="group rounded-lg border border-line bg-card px-4 py-3 transition-colors duration-150 hover:border-accent/40">
      {/* Line one: why it is here, what it is, and how good it is. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-accent">
            {isNew ? (
              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] tracking-wider text-white uppercase">
                New
              </span>
            ) : null}
            {/* The list stands, so this marks what is worth a second look
                rather than what earned its place. */}
            {!isNew && deal.changedSinceSeen ? (
              <span className="rounded bg-highlight px-1.5 py-0.5 text-[10px] tracking-wider text-ink uppercase">
                Changed
              </span>
            ) : null}
            <span className="truncate">{deal.headline}</span>
          </p>

          {/* Address and what it is, on one line. The meta was its own line
              and said four short things that fit beside the name. */}
          <h3 className="mt-0.5 truncate text-[15px] leading-snug font-medium">
            <Link href={`/property/${deal.propertyId}`} className="transition-colors hover:text-accent">
              {deal.address ?? 'Address not held'}
            </Link>
            <span className="ml-2 text-[13px] font-normal text-muted">
              {[deal.postcode, formatBedrooms(deal.bedrooms), deal.propertyType].filter(Boolean).join(' · ')}
            </span>
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ScoreBadge score={deal.totalScore} />
          <WatchButton propertyId={deal.propertyId} watched={deal.watched} />
        </div>
      </div>

      {/* Line two: the figures that decide whether to stop, on one line. */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <Figure label="Asking" value={formatMoney(deal.price)} />
        <Figure
          label="Rent"
          value={deal.enrichment.estimatedRent ? `${formatMoney(deal.enrichment.estimatedRent)} pcm` : NOT_HELD}
        />
        {grossYield ? <Figure label="Yield" value={grossYield.replace(' gross', '')} /> : null}
        {perSqFt ? <Figure label="Per sq ft" value={perSqFt.replace('£', '£').replace(' per sq ft', '')} /> : null}
        <Figure
          label="Listed"
          value={deal.daysOnMarket === null ? NOT_HELD : `${deal.daysOnMarket}d`}
        />
        {winner && deal.strategyScores.length > 1 ? (
          <span className="text-xs text-muted">best as a {winner.label.toLowerCase()}</span>
        ) : null}
      </div>

      {deal.state === 'sstc' ? (
        <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-1.5 text-sm">
          Sold subject to contract when we last looked. It may still fall through, which is exactly when it would come
          back to you.
        </p>
      ) : null}

      <RiskFlags risks={deal.risks} compact />

      {/* Line three: everything somebody who has stopped will want. */}
      <details className="group/details mt-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-150 group-open/details:rotate-90"
          >
            ›
          </span>
          <span className="underline underline-offset-4">The figures and the workings</span>
        </summary>

        <div className="mt-4 space-y-5 border-t border-line pt-4">
          <StackedNumbers property={deal} />

          {deal.epc || deal.councilTaxBand ? (
            <p className="text-sm text-muted">
              {deal.epc ? `EPC ${deal.epc.rating}${deal.epc.score === null ? '' : ` (${deal.epc.score})`}` : null}
              {deal.epc && deal.councilTaxBand ? ' · ' : null}
              {deal.councilTaxBand ? `Council tax band ${deal.councilTaxBand}` : null}
              <span>. Matched to this address, not to the postcode.</span>
            </p>
          ) : null}

          {winner ? (
            <p className="text-sm text-muted">
              Scored as a <span className="font-medium text-ink">{winner.label.toLowerCase()}</span>, which is the
              strategy this property suits best of the ones you run.
            </p>
          ) : null}

          <ScoreBreakdown
            quality={deal.qualityFactors}
            movement={deal.movementFactors}
            qualityScore={deal.qualityScore}
            movementScore={deal.movementScore}
            version={deal.scoreVersion}
          />
        </div>
      </details>

      {/* Line four: what to do about it. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5 text-[13px]">
        <StageControl propertyId={deal.propertyId} stage={stage} compact />

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/property/${deal.propertyId}`}
            className="text-muted underline underline-offset-4 transition-colors hover:text-accent"
          >
            Timeline
          </Link>

          {deal.listingUrl ? (
            <a
              href={directListingUrl(deal.listingUrl) ?? deal.listingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted underline underline-offset-4 transition-colors hover:text-accent"
            >
              {listingPortal(deal.listingUrl)
                ? `View on ${listingPortal(deal.listingUrl)}`
                : 'View the original listing'}
            </a>
          ) : null}

          {/* Taking it off the list is the subscriber's decision and it holds:
              it will not come back however well it scores later. */}
          {stage === null ? (
            <form action={setStageAction}>
              <input type="hidden" name="propertyId" value={deal.propertyId} />
              <input type="hidden" name="stage" value="passed" />
              <button
                type="submit"
                title="Take this off your list. It will not come back."
                className="text-muted underline underline-offset-4 transition-colors hover:text-ink"
              >
                Not for me
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  )
}
