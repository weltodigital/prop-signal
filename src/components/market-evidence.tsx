import type { MarketEvidence, PropertyDetail } from '@/lib/deals'
import { formatMoney, formatPercent, formatShortDate, NOT_HELD } from '@/lib/format'

/**
 * The market this property sits in.
 *
 * Split out of the numbers because it answers a different question. The
 * numbers say what this property costs and earns; this says whether those
 * figures are any good, and one is unreadable without the other — "£141 per
 * square foot" means nothing until you know what nearby homes actually sold
 * for.
 *
 * Every figure here is the area's, not the property's, and dated to the run
 * that fetched it. That distinction matters enough to be stated at the bottom
 * rather than assumed: a subscriber comparing two properties in one postcode
 * is looking at the same evidence twice, and should know it.
 */

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  const held = value !== NOT_HELD

  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {note ? <p className="mt-1 text-sm leading-relaxed text-muted">{note}</p> : null}
      </div>
      <p className={`shrink-0 ${held ? 'figure text-base' : 'label whitespace-nowrap text-muted'}`}>{value}</p>
    </div>
  )
}

export function MarketEvidenceCard({
  evidence,
  property,
}: {
  evidence: MarketEvidence | null
  property: PropertyDetail
}) {
  if (!evidence) return null

  const perSqFt =
    property.price && property.price > 0 && property.internalAreaSqFt
      ? property.price / property.internalAreaSqFt
      : null

  // The comparison the score is actually built on, said in words. Positive is
  // cheaper than the area, which is the direction a buyer cares about.
  const discount =
    perSqFt !== null && evidence.soldPricePerSqFt
      ? ((evidence.soldPricePerSqFt - perSqFt) / evidence.soldPricePerSqFt) * 100
      : null

  const grossYield =
    property.price && property.price > 0 && property.enrichment.estimatedRent
      ? ((property.enrichment.estimatedRent * 12) / property.price) * 100
      : null

  const yieldGap =
    grossYield !== null && evidence.localGrossYieldPercent
      ? grossYield - evidence.localGrossYieldPercent
      : null

  const range =
    evidence.soldRangeLow && evidence.soldRangeHigh
      ? `${formatMoney(evidence.soldRangeLow)} to ${formatMoney(evidence.soldRangeHigh)}`
      : null

  return (
    <div>
      <Row
        label="Nearby sold prices"
        value={evidence.soldPricePerSqFt === null ? NOT_HELD : `${formatMoney(evidence.soldPricePerSqFt)} / sq ft`}
        note={[
          range ? `Range ${range}` : null,
          evidence.soldTransactions ? `${evidence.soldTransactions} completed sales` : null,
          evidence.soldLatest ? `latest ${formatShortDate(evidence.soldLatest)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {perSqFt !== null && discount !== null ? (
        <Row
          label="This property against them"
          value={`${formatMoney(Math.round(perSqFt))} / sq ft`}
          note={
            discount >= 0
              ? `Asking ${formatPercent(discount)} below what nearby homes sold for`
              : `Asking ${formatPercent(Math.abs(discount))} above what nearby homes sold for`
          }
        />
      ) : null}

      <Row
        label="Local demand"
        value={
          property.enrichment.areaDemandRating === null
            ? NOT_HELD
            : `${property.enrichment.areaDemandRating.toFixed(0)} / 100`
        }
        note="How quickly stock is selling around here. Read for this property's own postcode."
      />

      <Row
        label="Local gross yield"
        value={
          evidence.localGrossYieldPercent === null
            ? NOT_HELD
            : `${formatPercent(evidence.localGrossYieldPercent)}`
        }
        note={
          yieldGap === null
            ? 'What rented stock in this area achieves against its price.'
            : yieldGap >= 0
              ? `This property is ${formatPercent(yieldGap)} above the local figure`
              : `This property is ${formatPercent(Math.abs(yieldGap))} below the local figure`
        }
      />

      {evidence.growth1YearPercent !== null || evidence.growth5YearPercent !== null ? (
        <Row
          label="Capital growth"
          value={
            evidence.growth5YearPercent === null
              ? `${formatPercent(evidence.growth1YearPercent ?? 0)} over a year`
              : `${formatPercent(evidence.growth5YearPercent)} over five years`
          }
          note={
            evidence.growth1YearPercent === null || evidence.growth5YearPercent === null
              ? undefined
              : `${formatPercent(evidence.growth1YearPercent)} over the last year`
          }
        />
      ) : null}

      <p className="mt-4 text-sm text-muted">
        These are figures about {evidence.postcode} rather than about this property, observed{' '}
        {formatShortDate(evidence.observedAt)}. Two properties in the same postcode share them.
      </p>
    </div>
  )
}
