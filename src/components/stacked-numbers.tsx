import type { PropertySnapshot } from '@/lib/deals'
import { formatArea, formatMoney, formatPercent, formatShortDate, NOT_HELD } from '@/lib/format'

/**
 * The numbers, stacked.
 *
 * Every one of them is either a figure we hold or the words "not held". None is
 * inferred, averaged or filled in — the two derived lines below, yield and the
 * gap to the estimate, are stated arithmetic on figures shown alongside them,
 * and both disappear entirely when either input is missing.
 */

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  const held = value !== NOT_HELD

  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`nums text-base ${held ? 'font-medium' : 'text-muted'}`}>{value}</dd>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  )
}

export function StackedNumbers({ property }: { property: PropertySnapshot }) {
  const { price, enrichment } = property

  const grossYield =
    price && price > 0 && enrichment.estimatedRent ? ((enrichment.estimatedRent * 12) / price) * 100 : null

  const valueGap =
    price && price > 0 && enrichment.estimatedValue
      ? ((enrichment.estimatedValue - price) / enrichment.estimatedValue) * 100
      : null

  const perSqFt = price && price > 0 && property.internalAreaSqFt ? price / property.internalAreaSqFt : null

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Figure label="Asking price" value={formatMoney(price)} />

        <Figure
          label="Estimated value"
          value={formatMoney(enrichment.estimatedValue)}
          note={
            valueGap === null
              ? undefined
              : valueGap >= 0
                ? `Asking ${formatPercent(valueGap)} below it`
                : `Asking ${formatPercent(Math.abs(valueGap))} above it`
          }
        />

        <Figure
          label="Estimated rent"
          value={enrichment.estimatedRent === null ? NOT_HELD : `${formatMoney(enrichment.estimatedRent)} a month`}
          note={grossYield === null ? undefined : `${formatPercent(grossYield)} gross yield on the asking price`}
        />

        <Figure
          label="Floor area"
          value={formatArea(property.internalAreaSqFt)}
          note={perSqFt === null ? undefined : `${formatMoney(Math.round(perSqFt))} per sq ft`}
        />

        <Figure
          label="Local demand"
          value={
            enrichment.areaDemandRating === null
              ? NOT_HELD
              : `${enrichment.areaDemandRating.toFixed(0)} out of 100`
          }
        />

        <Figure
          label="Days on the market"
          value={property.daysOnMarket === null ? NOT_HELD : property.daysOnMarket.toLocaleString('en-GB')}
          note={
            property.daysSincePriceChange === null
              ? undefined
              : `Price last moved ${property.daysSincePriceChange} days ago`
          }
        />
      </dl>

      <p className="mt-4 text-sm text-muted">
        {enrichment.enrichedAt
          ? `Valuations retrieved ${formatShortDate(enrichment.enrichedAt)}. `
          : 'No valuations have been retrieved for this property. '}
        Everything above was observed on {formatShortDate(property.observedAt)} and is what we saw then, not a claim
        about today.
      </p>
    </>
  )
}
