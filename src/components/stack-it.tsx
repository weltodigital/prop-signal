'use client'

import { useState } from 'react'
import { DEFAULT_INPUTS, stack, type StackInputs } from '@/lib/stack'
import { bandTotal, REFURB_BANDS } from '@/lib/refurb'
import { formatMoney, formatPercent, formatSignedMoney, NOT_HELD } from '@/lib/format'

/**
 * Stack it.
 *
 * Runs entirely in the browser against figures already stored, so moving a
 * number costs nothing and can be done as often as you like. Nothing here calls
 * an API — the arithmetic is in `@/lib/stack`, which is pure and tested.
 *
 * The starting figures come from what we hold and are labelled as such. They
 * are a starting point to be overwritten, not our view of what you should pay.
 */

type Field = {
  key: keyof StackInputs
  label: string
  suffix?: string
  step?: number
  note?: string
}

const PURCHASE_FIELDS: Field[] = [
  { key: 'purchasePrice', label: 'Purchase price', suffix: '£' },
  { key: 'refurbCost', label: 'Refurbishment', suffix: '£' },
  { key: 'buyingCosts', label: 'Buying costs', suffix: '£', note: 'Stamp duty, legals, survey. Not worked out for you.' },
  { key: 'depositPercent', label: 'Deposit', suffix: '%', step: 1 },
]

const FINANCE_FIELDS: Field[] = [
  { key: 'annualRatePercent', label: 'Interest rate', suffix: '%', step: 0.1 },
  { key: 'termYears', label: 'Term', suffix: 'years', step: 1 },
  { key: 'monthlyRent', label: 'Monthly rent', suffix: '£' },
  { key: 'monthlyCosts', label: 'Monthly costs', suffix: '£', note: 'Management, insurance, a sinking fund.' },
]

const REFINANCE_FIELDS: Field[] = [
  { key: 'postRefurbValue', label: 'Value after works', suffix: '£' },
  { key: 'refinanceLtvPercent', label: 'Refinance at', suffix: '% LTV', step: 1 },
]

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <span className={`text-sm ${strong ? 'font-medium' : 'text-muted'}`}>{label}</span>
      <span className={`figure text-sm ${strong ? 'font-medium' : ''}`}>{value}</span>
    </div>
  )
}

export function StackIt({
  askingPrice,
  estimatedRent,
  estimatedValue,
  internalAreaSqFt,
}: {
  askingPrice: number | null
  estimatedRent: number | null
  estimatedValue: number | null
  /** Drives the refurbishment ranges. Null where no floor area is held. */
  internalAreaSqFt: number | null
}) {
  const [inputs, setInputs] = useState<StackInputs>({
    ...DEFAULT_INPUTS,
    purchasePrice: askingPrice ?? 0,
    monthlyRent: estimatedRent ?? 0,
    postRefurbValue: estimatedValue,
  })

  const result = stack(inputs)

  const set = (key: keyof StackInputs, raw: string) => {
    if (key === 'interestOnly') return
    const parsed = raw === '' ? 0 : Number(raw)
    const value = Number.isFinite(parsed) ? parsed : 0
    setInputs((current) => ({ ...current, [key]: key === 'postRefurbValue' && raw === '' ? null : value }))
  }

  const renderFields = (fields: Field[]) =>
    fields.map((field) => {
      const held = inputs[field.key]
      const value = typeof held === 'number' ? held : held === null ? '' : ''

      return (
        <div key={field.key} className="space-y-1">
          <label htmlFor={`stack-${field.key}`} className="block text-sm text-muted">
            {field.label}
            {field.suffix ? <span className="ml-1">({field.suffix})</span> : null}
          </label>
          <input
            id={`stack-${field.key}`}
            type="number"
            inputMode="decimal"
            step={field.step ?? 100}
            min={0}
            value={value}
            onChange={(event) => set(field.key, event.target.value)}
            className="figure w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {field.note ? <p className="text-sm text-muted">{field.note}</p> : null}
        </div>
      )
    })

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">{renderFields(PURCHASE_FIELDS)}</div>

        {/* What a refurbishment costs, as ranges to land inside rather than an
            empty box to guess into. Clicking one fills the field; the number
            stays yours to change. */}
        <div className="border-t border-line pt-5">
          <p className="label text-muted">What works might cost</p>
          <p className="mt-2 text-sm text-muted">
            {internalAreaSqFt
              ? `Rough trade ranges across ${Math.round(internalAreaSqFt).toLocaleString('en-GB')} sq ft. Not a quote, and not local to this postcode.`
              : 'Rough trade ranges per square foot. No floor area is held for this property, so there is no total to give you.'}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {REFURB_BANDS.map((band) => {
              const total = bandTotal(band, internalAreaSqFt)
              return (
                <button
                  key={band.id}
                  type="button"
                  onClick={() => setInputs((current) => ({ ...current, refurbCost: total ? Math.round((total.low + total.high) / 2) : current.refurbCost }))}
                  disabled={total === null}
                  className="rounded-md border border-line p-3 text-left transition-colors hover:border-highlight-deep/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block text-sm font-medium">{band.label}</span>
                  <span className="figure mt-1.5 block text-base">
                    {total ? `${formatMoney(total.low)} to ${formatMoney(total.high)}` : `£${band.perSqFtLow} to £${band.perSqFtHigh} per sq ft`}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted">{band.detail}</span>
                </button>
              )
            })}
          </div>

          <p className="mt-3 text-sm text-muted">
            Your builder&rsquo;s quote is the only real figure. These are what the trade charges, stated as ranges so
            you can put your own job somewhere in one.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">{renderFields(FINANCE_FIELDS)}</div>

        <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
          <legend className="mb-2 text-sm text-muted">Mortgage</legend>
          {[
            { value: true, label: 'Interest only' },
            { value: false, label: 'Capital and interest' },
          ].map((option) => (
            <label key={String(option.value)} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="interestOnly"
                checked={inputs.interestOnly === option.value}
                onChange={() => setInputs((current) => ({ ...current, interestOnly: option.value }))}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <div>
          <h4 className="text-sm font-medium">Refinance</h4>
          <p className="mt-1 text-sm text-muted">
            Leave the value after works empty if you are not refinancing, and this section disappears rather than
            guessing at an uplift.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{renderFields(REFINANCE_FIELDS)}</div>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h4 className="text-sm font-medium">Going in</h4>
        <div className="mt-2">
          <Row label="Deposit" value={formatMoney(result.deposit)} />
          <Row label="Mortgage" value={formatMoney(result.loan)} />
          <Row label="Cash in" value={formatMoney(result.cashIn)} strong />
        </div>

        <h4 className="mt-5 text-sm font-medium">Each month</h4>
        <div className="mt-2">
          <Row label={inputs.interestOnly ? 'Interest' : 'Repayment'} value={formatMoney(result.monthlyMortgage)} />
          <Row label="Cashflow" value={formatSignedMoney(result.monthlyCashflow)} strong />
        </div>

        <h4 className="mt-5 text-sm font-medium">The return</h4>
        <div className="mt-2">
          <Row label="Gross yield" value={formatPercent(result.grossYieldPercent, 2, NOT_HELD)} />
          <Row label="Cash on cash" value={formatPercent(result.cashOnCashPercent, 2, NOT_HELD)} strong />
        </div>

        {result.refinance ? (
          <>
            <h4 className="mt-5 text-sm font-medium">After the refinance</h4>
            <div className="mt-2">
              <Row label="New mortgage" value={formatMoney(result.refinance.newLoan)} />
              <Row
                label={result.refinance.released < 0 ? 'To put in' : 'Released'}
                value={formatMoney(Math.abs(result.refinance.released))}
              />
              <Row
                label="Left in"
                value={result.refinance.allOut ? 'All out' : formatMoney(result.refinance.leftIn)}
                strong
              />
              <Row
                label="Return on money left in"
                value={
                  result.refinance.allOut
                    ? 'No money left in'
                    : formatPercent(result.refinance.returnOnLeftInPercent, 2, NOT_HELD)
                }
              />
              <Row
                label={inputs.interestOnly ? 'Interest after' : 'Repayment after'}
                value={formatMoney(result.refinance.newMonthlyMortgage)}
              />
            </div>
          </>
        ) : null}

        <p className="mt-5 text-sm text-muted">
          Your figures, your arithmetic. Nothing here is advice, no allowance is made for tax, and the cashflow above
          is before void periods.
        </p>
      </div>
    </div>
  )
}
