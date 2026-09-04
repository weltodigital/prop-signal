import Link from 'next/link'
import type { PublishedDeal } from '@/lib/deals'
import { formatBedrooms, formatMoney, NOT_HELD, situationsFor } from '@/lib/format'
import { isInvestmentStrategy, STRATEGY_DEFINITIONS } from '@/lib/strategies'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { StackedNumbers } from '@/components/stacked-numbers'
import { RiskFlags } from '@/components/risk-flags'
import { StageControl } from '@/components/stage-control'
import { setStageAction } from '@/app/(app)/deals/actions'
import { ActionAnchor, ActionButton, ActionLink } from '@/components/ui'
import { Meter } from '@/components/motion-ui'
import { BAND_COUNT, scoreBand } from '@/lib/score-band'
import { reasonsFor } from '@/lib/reasons'
import { RefurbEstimate } from '@/components/refurb-estimate'
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
 * The score, as a band rather than a fraction.
 *
 * The arithmetic behind it has not changed and the breakdown one click down
 * still shows every point out of 150. What changed is that the card stopped
 * printing the fraction, because a fraction is read as a percentage whether or
 * not it is one.
 *
 * The ceiling of 150 needs a property to be both an excellent buy and to have a
 * seller who has been cutting for a year, so almost nothing reaches it. A
 * perfect new listing comes to about 100 — which read as 67% and made the best
 * property in somebody's area look like a C. The word says what the number
 * meant all along.
 *
 * The meter fills by band rather than by score for the same reason: a bar
 * two-thirds full is a percentage by another route.
 */
function ScoreMeter({ score }: { score: number }) {
  const band = scoreBand(score)

  return (
    <div
      className="w-[5.5rem] shrink-0 text-right"
      title={`${band.note} Scored ${score.toFixed(1)} of 150 — open the breakdown for the workings.`}
    >
      <p className="text-base leading-none font-medium text-highlight-deep">{band.label}</p>
      <Meter
        share={band.rank / BAND_COUNT}
        trackClassName="mt-2 h-[3px] w-full bg-line"
        className="h-full bg-highlight-deep"
      />
    </div>
  )
}

export function DealCard({
  deal,
  isNew = false,
  stage = null,
  gdvPerSqFt = null,
}: {
  deal: PublishedDeal
  isNew?: boolean
  /** Where this one got to, where the subscriber has started tracking it. */
  stage?: DealStage | null
  /** Local development value per square foot, for re-costing a flip. */
  gdvPerSqFt?: number | null
}) {
  const winner = deal.strategyScores.find((s) => s.strategy === deal.winningStrategy) ?? null
  const runnersUp = deal.strategyScores
    .filter((s) => s.strategy !== deal.winningStrategy)
    .sort((a, b) => b.total - a.total)

  const reasons = reasonsFor(deal)

  // Which of the situations the subscriber asked for this one came out of.
  // The reasons below say why it scored well; this says why it was looked at,
  // and on a list built from four ticked boxes they are different questions.
  const situations = situationsFor(deal.lists)

  const perSqFt =
    deal.price && deal.internalAreaSqFt ? `£${Math.round(deal.price / deal.internalAreaSqFt)} per sq ft` : null

  const grossYield =
    deal.price && deal.enrichment.estimatedRent
      ? `${(((deal.enrichment.estimatedRent * 12) / deal.price) * 100).toFixed(1)}% gross`
      : null

  return (
    <article className="group rounded-xl border border-line bg-card p-5 transition-colors duration-150 hover:border-highlight-deep/40">
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
            {/* The situation it was found in, strongest first. Two at most:
                a property on five lists is common and a row of five badges
                reads as decoration rather than as information, so the rest
                are named in the title and counted. */}
            {situations.slice(0, 2).map((situation) => (
              <span
                key={situation}
                className="label border border-line px-1.5 py-0.5 text-muted"
                title={
                  situations.length > 2
                    ? `Found in: ${situations.join(', ')}`
                    : `Found in the ${situation.toLowerCase()} search`
                }
              >
                {situation}
              </span>
            ))}
            {situations.length > 2 ? (
              <span className="label text-muted" title={`Found in: ${situations.join(', ')}`}>
                +{situations.length - 2}
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

        {/* The score gets its own panel: it is the one figure the eye is
            running down the list to find. */}
        <div className="shrink-0 rounded-lg bg-tint px-3 py-2">
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

      {/* Why this is in front of you.
          
          The most prominent thing on the card after the address, because it is
          the question somebody scanning a list is actually asking. The score
          says which to look at first; it cannot say why you are looking, and a
          card that led with a number was answering the wrong question.
          
          Built from the factors the score was made of, so this and the
          breakdown below are the same arithmetic said twice. */}
      {reasons.length ? (
        <ul className="mt-3 space-y-1">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5 text-sm">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-highlight-deep" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

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
          <span className="underline underline-offset-4">The full figures and how it scored</span>
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

          {/* A flip is the one strategy scored on a figure we do not hold, so
              the assumption is stated here and can be moved. */}
          {deal.strategyScores.some((entry) => entry.strategy === 'brrr') ? (
            <div className="border-t border-line pt-4">
              <RefurbEstimate
                price={deal.price}
                internalAreaSqFt={deal.internalAreaSqFt}
                gdvPerSqFt={gdvPerSqFt}
                monthlyRent={deal.enrichment.estimatedRent}
              />
            </div>
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
          {/* The property page is where the decision gets made, so it is the
              lead action. The advert is one click further on, from a page that
              has already told them whether it is worth opening. */}
          <ActionLink href={`/property/${deal.propertyId}`} tone="strong">
            View property
            <span aria-hidden="true" className="text-[11px] opacity-70">
              →
            </span>
          </ActionLink>

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
