import Link from 'next/link'
import type { PublishedDeal } from '@/lib/deals'
import { formatBedrooms, formatListName } from '@/lib/format'
import { Card } from '@/components/ui'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { StackedNumbers } from '@/components/stacked-numbers'
import { RiskFlags } from '@/components/risk-flags'
import { StageControl } from '@/components/stage-control'
import type { DealStage } from '@/lib/deal-stages'
import { WatchButton } from '@/components/watch-button'

/**
 * A published deal.
 *
 * The qualifying event is in the headline position, because it is the reason
 * the property is here at all. Every figure carries the date it was observed.
 * There is never a photograph — listing images carry no rights under the
 * PropertyData terms, so we link to the advert and describe the property in
 * words.
 */
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

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-accent">
            {isNew ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs tracking-wide text-white uppercase">
                New
              </span>
            ) : null}
            {deal.headline}
          </p>
          <h3 className="mt-1 text-lg font-medium">
            <Link href={`/property/${deal.propertyId}`} className="hover:text-accent">
              {deal.address ?? 'Address not held'}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {[deal.postcode, formatBedrooms(deal.bedrooms), deal.propertyType].filter(Boolean).join(' · ')}
          </p>
          {/* Which of the subscriber's strategies this property suits. Where
              they run only one it says nothing they do not know, so it is only
              shown once there is a comparison to draw. */}
          {winner && deal.strategyScores.length > 1 ? (
            <p className="mt-1.5 text-sm">
              <span className="font-medium">Best as a {winner.label.toLowerCase()}</span>
              <span className="text-muted">
                {' '}
                — {runnersUp.map((s) => `${s.label.toLowerCase()} ${s.total.toFixed(0)}`).join(', ')}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="nums text-sm text-muted">Score {deal.totalScore.toFixed(0)}</p>
          <WatchButton propertyId={deal.propertyId} watched={deal.watched} />
        </div>
      </div>

      {deal.state === 'sstc' ? (
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-sm">
          Marked sold subject to contract when we last looked. It may still fall through, which is exactly when it
          would come back to you.
        </p>
      ) : null}

      <div className="mt-5">
        <StackedNumbers property={deal} />
      </div>

      {deal.epc || deal.councilTaxBand ? (
        <p className="mt-3 text-sm text-muted">
          {deal.epc ? `EPC ${deal.epc.rating}${deal.epc.score === null ? '' : ` (${deal.epc.score})`}` : null}
          {deal.epc && deal.councilTaxBand ? ' · ' : null}
          {deal.councilTaxBand ? `Council tax band ${deal.councilTaxBand}` : null}
          <span> — matched to this address, not to the postcode.</span>
        </p>
      ) : null}

      <RiskFlags risks={deal.risks} />

      {deal.lists.length ? (
        <p className="mt-4 flex flex-wrap gap-2">
          {deal.lists.map((list) => (
            <span key={list} className="rounded-full border border-line px-2.5 py-0.5 text-sm text-muted">
              {formatListName(list)}
            </span>
          ))}
        </p>
      ) : null}

      {/* Native details, so the breakdown is there without a line of client
          JavaScript and is open to anyone who wants to argue with the score. */}
      <details className="group mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
          <span className="underline underline-offset-4">
            How this scored {deal.totalScore.toFixed(0)}
          </span>
        </summary>
        <div className="mt-4">
          {winner ? (
            <p className="mb-4 text-sm text-muted">
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

      <div className="mt-5 border-t border-line pt-4">
        <StageControl propertyId={deal.propertyId} stage={stage} />
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href={`/property/${deal.propertyId}`} className="underline underline-offset-4 hover:text-accent">
          Timeline and workings
        </Link>
        {deal.listingUrl ? (
          <a
            href={deal.listingUrl}
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
  )
}
