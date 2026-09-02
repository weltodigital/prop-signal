'use client'

import { useState } from 'react'
import { bandTotal, REFURB_BANDS, SCORING_BAND, DEFAULT_REFURB_PER_SQ_FT } from '@/lib/refurb'
import { COSTS_PERCENT_OF_RENT, STRATEGY_FINANCE } from '@/lib/strategies'
import { stack } from '@/lib/stack'
import { formatMoney, formatPercent } from '@/lib/format'

/**
 * What the works might cost, decided on the property rather than on a form.
 *
 * A refurbishment cost is not a fact about a subscriber, it is a judgement
 * about a house — which is why asking for one number up front, before they had
 * seen a single property, was the wrong place to ask. The ranking has to assume
 * something, so it assumes a full refurbishment and says so; here that
 * assumption is three buttons wide and the arithmetic follows whichever one
 * matches the job in front of them.
 *
 * Everything is computed in the browser from figures already on the page. It
 * costs nothing to move, so it can be moved as often as it takes.
 */
export function RefurbEstimate({
  price,
  internalAreaSqFt,
  gdvPerSqFt,
  monthlyRent,
}: {
  price: number | null
  internalAreaSqFt: number | null
  /** What finished space sells for locally. Null where the run held none. */
  gdvPerSqFt: number | null
  monthlyRent: number | null
}) {
  const [perSqFt, setPerSqFt] = useState(DEFAULT_REFURB_PER_SQ_FT)

  if (!internalAreaSqFt || !price) {
    return (
      <p className="text-sm text-muted">
        No floor area is held for this property, so there is nothing to cost the works against.
      </p>
    )
  }

  const works = Math.round(perSqFt * internalAreaSqFt)
  const endValue = gdvPerSqFt === null ? null : Math.round(gdvPerSqFt * internalAreaSqFt)

  const result = stack({
    purchasePrice: price,
    refurbCost: works,
    buyingCosts: 0,
    depositPercent: STRATEGY_FINANCE.depositPercent,
    annualRatePercent: STRATEGY_FINANCE.annualRatePercent,
    termYears: STRATEGY_FINANCE.termYears,
    interestOnly: STRATEGY_FINANCE.interestOnly,
    monthlyRent: monthlyRent ?? 0,
    monthlyCosts: Math.round((monthlyRent ?? 0) * (COSTS_PERCENT_OF_RENT.brrr / 100)),
    postRefurbValue: endValue,
    refinanceLtvPercent: STRATEGY_FINANCE.refinanceLtvPercent,
  })

  const recovered =
    result.refinance && result.cashIn > 0
      ? ((result.cashIn - result.refinance.leftIn) / result.cashIn) * 100
      : null

  return (
    <div>
      <p className="label text-muted">What the works might cost</p>
      <p className="mt-2 text-sm text-muted">
        Scored at {formatMoney(DEFAULT_REFURB_PER_SQ_FT)} a square foot, which is a full refurbishment. Pick the job
        you think this is and the rest follows. These are trade ranges, not a quote.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {REFURB_BANDS.map((band) => {
          const total = bandTotal(band, internalAreaSqFt)
          const chosen = perSqFt >= band.perSqFtLow && perSqFt <= band.perSqFtHigh
          return (
            <button
              key={band.id}
              type="button"
              onClick={() => setPerSqFt(Math.round((band.perSqFtLow + band.perSqFtHigh) / 2))}
              aria-pressed={chosen}
              className={`rounded-md border p-3 text-left transition-colors ${
                chosen ? 'border-highlight-deep/50 bg-tint' : 'border-line hover:border-highlight-deep/40'
              }`}
            >
              <span className="block text-sm font-medium">{band.label}</span>
              <span className="figure mt-1.5 block text-base">
                {total ? `${formatMoney(total.low)} to ${formatMoney(total.high)}` : '—'}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-muted">{band.detail}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="refurb-per-sqft" className="text-sm text-muted">
          Or set your own, per square foot
        </label>
        <input
          id="refurb-per-sqft"
          type="number"
          min={0}
          step={5}
          value={perSqFt}
          onChange={(event) => setPerSqFt(Math.max(0, Number(event.target.value) || 0))}
          className="figure w-28 rounded-md border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-highlight-deep focus:ring-2 focus:ring-highlight-deep/20"
        />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-5 sm:grid-cols-4">
        <div>
          <dt className="label text-muted">The works</dt>
          <dd className="figure mt-1.5 text-xl leading-tight">{formatMoney(works)}</dd>
        </div>
        <div>
          <dt className="label text-muted">Cash in</dt>
          <dd className="figure mt-1.5 text-xl leading-tight">{formatMoney(result.cashIn)}</dd>
        </div>
        <div>
          <dt className="label text-muted">Value after works</dt>
          <dd className={`mt-1.5 ${endValue === null ? 'text-base text-muted' : 'figure text-xl leading-tight'}`}>
            {endValue === null ? 'Not held' : formatMoney(endValue)}
          </dd>
        </div>
        <div>
          <dt className="label text-muted">Left in</dt>
          <dd
            className={`mt-1.5 ${
              result.refinance ? 'figure text-xl leading-tight text-highlight-deep' : 'text-base text-muted'
            }`}
          >
            {result.refinance ? formatMoney(result.refinance.leftIn) : 'Not held'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted">
        {recovered === null
          ? 'No local development value is held for this area, so there is no end value to refinance against.'
          : `${formatPercent(recovered)} of your money comes back out on a refinance at ${STRATEGY_FINANCE.refinanceLtvPercent}% loan to value. Your builder's quote is the only real figure here.`}
      </p>
    </div>
  )
}
