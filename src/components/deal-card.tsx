import Link from 'next/link'
import type { PublishedDeal } from '@/lib/deals'
import { formatBedrooms, formatListName, formatMoney, NOT_HELD } from '@/lib/format'
import { isInvestmentStrategy, STRATEGY_DEFINITIONS } from '@/lib/strategies'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { StackedNumbers } from '@/components/stacked-numbers'
import { RiskFlags } from '@/components/risk-flags'
import { StageControl } from '@/components/stage-control'
import { setStageAction } from '@/app/(app)/deals/actions'
import { ActionAnchor, ActionButton, ActionLink } from '@/components/ui'
import { directListingUrl, listingPortal } from '@/lib/listing-url'
import type { DealStage } from '@/lib/deal-stages'

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
      <span className="label text-muted">{label}</span>
      <span className="figure font-medium">{value}</span>
    </span>
  )
}

/**
 * The score, as a number and a meter.
 *
 * A column of bare numbers reads flat: an eye running down the list has to
 * compare five two-digit figures to find the one worth stopping at. The meter
 * does that comparison for it.
 *
 * The track is a lighter step of the same ramp rather than grey, so the state
 * reads across the whole bar rather than only across the filled part. Out of
 * 150, which is the real ceiling: quality in full plus half of movement.
 *
 * Tabular figures here, because this is a column and the digits have to line up
 * down the page.
 */
function ScoreMeter({ score }: { score: number }) {
  const share = Math.max(0, Math.min(1, score / 150))

  return (
    <div className="w-14 shrink-0 text-right" title={`${score.toFixed(1)} out of 150`}>
      <p className="figure text-2xl leading-none text-highlight-deep">{score.toFixed(0)}</p>
      <div className="mt-1.5 h-[3px] w-full overflow-hidden bg-line">
        <div
          className="h-full bg-highlight-deep transition-[width] duration-300"
          style={{ width: `${Math.max(share * 100, 4)}%` }}
        />
      </div>
    </div>
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
    <article className="group border-t border-line py-4 transition-colors duration-150 hover:bg-ink/[0.02]">
      {/* Line one: why it is here, what it is, and how good it is. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium">
            {isNew ? (
              <span className="label border border-line px-1.5 py-0.5 text-ink">New</span>
            ) : null}
            {/* The list stands, so this marks what is worth a second look
                rather than what earned its place. */}
            {!isNew && deal.changedSinceSeen ? (
              <span className="label border border-highlight-deep/40 px-1.5 py-0.5 text-highlight-deep">
                Changed
              </span>
            ) : null}
            <span className="truncate">{deal.headline}</span>
          </p>

          {/* Address and what it is, on one line. The meta was its own line
              and said four short things that fit beside the name. */}
          <h3 className="mt-0.5 truncate text-[15px] leading-snug font-medium">
            <Link href={`/property/${deal.propertyId}`} className="transition-colors hover:text-highlight-deep">
              {deal.address ?? 'Address not held'}
            </Link>
            <span className="ml-2 text-[13px] font-normal text-muted">
              {[deal.postcode, formatBedrooms(deal.bedrooms), deal.propertyType].filter(Boolean).join(' · ')}
            </span>
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ScoreMeter score={deal.totalScore} />
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
      </div>

      {/* Which of the subscriber's strategies this suits, and what it scored as
          each of them. Only where they run more than one: with a single
          strategy the badge would be on every row and say nothing. */}
      {deal.strategyScores.length > 1 ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {[winner, ...runnersUp].filter((entry) => entry !== null).map((entry) => {
            const definition = isInvestmentStrategy(entry.strategy) ? STRATEGY_DEFINITIONS[entry.strategy] : null
            const best = entry.strategy === deal.winningStrategy
            return (
              <span
                key={entry.strategy}
                title={definition ? `${entry.label}: ${definition.measures}` : entry.label}
                className={`label inline-flex items-baseline gap-1.5 border px-1.5 py-0.5 ${
                  best ? 'border-highlight-deep/40 text-highlight-deep' : 'border-line text-muted'
                }`}
              >
                {entry.label}
                <span className="figure">{entry.total.toFixed(0)}</span>
              </span>
            )
          })}
          {deal.lists.length > 1 ? (
            <span className="text-xs text-muted">
              found in {deal.lists.map((list) => formatListName(list).toLowerCase()).join(' and ')}
            </span>
          ) : null}
        </p>
      ) : null}

      {deal.state === 'sstc' ? (
        <p className="mt-3 border-l-2 border-warn/50 py-1 pl-3 text-sm">
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
              Scored as a <span className="font-medium text-ink">{winner.label.toLowerCase()}</span> at{' '}
              <span className="figure text-ink">{winner.total.toFixed(0)}</span>, which is the strategy this property
              suits best of the ones you run
              {isInvestmentStrategy(winner.strategy)
                ? `, measured on ${STRATEGY_DEFINITIONS[winner.strategy].measures.toLowerCase().replace(/\.$/, '')}`
                : ''}
              .
              {runnersUp.length
                ? ` As ${runnersUp
                    .map((entry) => `${entry.label.toLowerCase()} it comes to ${entry.total.toFixed(0)}`)
                    .join(', and as ')}.`
                : ''}
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ActionLink href={`/property/${deal.propertyId}`}>Timeline</ActionLink>

          {deal.listingUrl ? (
            <ActionAnchor
              tone="lead"
              href={directListingUrl(deal.listingUrl) ?? deal.listingUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {listingPortal(deal.listingUrl)
                ? `View on ${listingPortal(deal.listingUrl)}`
                : 'View the listing'}
              <span aria-hidden="true" className="text-[11px] opacity-70">
                ↗
              </span>
            </ActionAnchor>
          ) : null}

          {/* Taking it off the list is the subscriber's decision and it holds:
              it will not come back however well it scores later. */}
          {stage === null ? (
            <form action={setStageAction}>
              <input type="hidden" name="propertyId" value={deal.propertyId} />
              <input type="hidden" name="stage" value="passed" />
              <ActionButton
                tone="quiet"
                type="submit"
                title="Take this off your list. It will not come back."
              >
                Not for me
              </ActionButton>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  )
}
