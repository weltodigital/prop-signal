'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveSearch, type OnboardingState } from './actions'
import { Button, Card } from '@/components/ui'
import { PROPERTY_TYPES, RADIUS_OPTIONS, type SearchProfile, type SourcingList } from '@/lib/search-profile.types'
import { bandMidpoint, REFURB_BANDS } from '@/lib/refurb'
import { STRATEGY_LIST, type InvestmentStrategy } from '@/lib/strategies'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1.5 text-sm text-warn" role="alert">
      {message}
    </p>
  )
}

function Submit({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : isNew ? 'Save and build my first list' : 'Save changes'}
    </Button>
  )
}

export function SearchForm({
  sourcingLists,
  profile,
  searchChangesUsed,
  searchChangeLimit,
}: {
  sourcingLists: SourcingList[]
  profile: SearchProfile | null
  searchChangesUsed: number
  searchChangeLimit: number
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(saveSearch, { status: 'idle' })
  // Some lists will not search as wide as others, and one call carries all of
  // them, so the narrowest holds the whole search. That is worth saying plainly
  // rather than refusing to save, which is what it used to do.
  const [chosen, setChosen] = useState<string[]>(profile?.sourcingLists ?? [])
  const [radius, setRadius] = useState<number>(profile?.radiusMiles ?? 10)
  const [refurb, setRefurb] = useState<string>(
    profile?.assumptions.refurbCostPerSqFt === null || profile?.assumptions.refurbCostPerSqFt === undefined
      ? ''
      : String(profile.assumptions.refurbCostPerSqFt),
  )
  const capping =
    sourcingLists
      .filter((list) => chosen.includes(list.id) && list.maxRadiusMiles < radius)
      .sort((a, b) => a.maxRadiusMiles - b.maxRadiusMiles)[0] ?? null

  // Which strategies are ticked decides which figures we have to ask for. A
  // BRRR needs a refurb cost and a short let needs a nightly rate, because
  // PropertyData publish neither and this product will not invent them.
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>(
    profile?.investmentStrategies ?? ['btl'],
  )
  const needsRefurb = strategies.includes('brrr')

  const [showOptional, setShowOptional] = useState(
    Boolean(profile?.minPrice || profile?.maxPrice || profile?.minBedrooms || profile?.propertyTypes?.length),
  )

  const isNew = profile === null
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-6">
      {state.status === 'error' && state.message ? (
        <div className="rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-sm" role="alert">
          {state.message}
        </div>
      ) : null}

      <Card>
        <h2 className="text-base font-medium">1. Where</h2>
        <p className="mt-1 text-sm text-muted">
          One area, anywhere in the UK. A postcode you know, and how far from it you would actually travel.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="postcode" className="block text-sm font-medium">
              Postcode
            </label>
            <input
              id="postcode"
              name="postcode"
              required
              autoComplete="postal-code"
              defaultValue={profile?.postcode ?? ''}
              placeholder="M14 5TP"
              className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <FieldError message={errors.postcode} />
          </div>

          <div>
            <label htmlFor="radiusMiles" className="block text-sm font-medium">
              Radius
            </label>
            <select
              id="radiusMiles"
              name="radiusMiles"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {RADIUS_OPTIONS.map((miles) => (
                <option key={miles} value={miles}>
                  {miles} {miles === 1 ? 'mile' : 'miles'}
                </option>
              ))}
            </select>
            <FieldError message={errors.radiusMiles} />
            <p className="mt-1.5 text-sm text-muted">
              This is the biggest thing you control. Ten miles of a quiet market may hold two properties worth your
              time; forty miles of the same market holds far more. Widen it if your list is short.
            </p>
            {capping ? (
              <p className="mt-1.5 text-sm">
                Your search will run at {capping.maxRadiusMiles} miles, not {radius}, because {capping.label} will
                not go wider and one search covers every list you tick. Untick it to search the full {radius}.
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-medium">2. Your strategy</h2>
        <p className="mt-1 text-sm text-muted">
          How you intend to make money from a property, which is what decides whether it is a good one. The same
          three-bed can be an ordinary buy-to-let and an excellent HMO. Pick as many as you actually run. Each
          property is scored under all of them and ranked by whichever suits it best.
        </p>

        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Investment strategies</legend>
          {STRATEGY_LIST.map((strategy) => (
            <label
              key={strategy.id}
              className="flex cursor-pointer gap-3 rounded-md border border-line p-3 hover:bg-paper"
            >
              <input
                type="checkbox"
                name="investmentStrategies"
                value={strategy.id}
                defaultChecked={strategies.includes(strategy.id)}
                onChange={(event) =>
                  setStrategies((current) =>
                    event.target.checked
                      ? [...current, strategy.id]
                      : current.filter((id) => id !== strategy.id),
                  )
                }
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">{strategy.label}</span>
                <span className="block text-sm text-muted">{strategy.description}</span>
                <span className="mt-0.5 block text-sm text-muted">Scored on: {strategy.measures}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <FieldError message={errors.investmentStrategies} />

        {needsRefurb ? (
          <div className="mt-6 space-y-5 border-t border-line pt-5">
            <div>
              <p className="text-sm font-medium">What a refurbishment costs you</p>
              <p className="mt-1 text-sm text-muted">
                We do not hold this for any property and cannot derive it, so a flip or a BRRR is scored against your
                figure rather than ours. The bands below are what the trade charges, as ranges. Pick the one that
                sounds like your jobs, then move the number to whatever you actually pay.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {REFURB_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  onClick={() => setRefurb(String(bandMidpoint(band)))}
                  className="rounded-md border border-line p-3 text-left transition-colors hover:border-highlight-deep/40"
                >
                  <span className="block text-sm font-medium">{band.label}</span>
                  <span className="figure mt-1.5 block text-base">
                    £{band.perSqFtLow} to £{band.perSqFtHigh}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted">{band.detail}</span>
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="refurbCostPerSqFt" className="block text-sm font-medium">
                Refurb cost per square foot
              </label>
              <input
                id="refurbCostPerSqFt"
                name="refurbCostPerSqFt"
                type="number"
                min="1"
                inputMode="numeric"
                value={refurb}
                onChange={(event) => setRefurb(event.target.value)}
                className="figure mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="65"
              />
              <p className="mt-1 text-sm text-muted">
                In pounds, applied to each property&rsquo;s floor area. A quote from your builder beats any of the
                ranges above.
              </p>
              <FieldError message={errors.assumptions} />
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-medium">3. What to look for</h2>
        <p className="mt-1 text-sm text-muted">
          Which situations you want pulled out of the market. Pick as many as apply. More lists means more of the
          market searched, and more that can qualify.
        </p>

        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Sourcing lists</legend>
          {sourcingLists.map((list) => (
            <label
              key={list.id}
              className="flex cursor-pointer gap-3 rounded-md border border-line p-3 hover:bg-paper"
            >
              <input
                type="checkbox"
                name="sourcingLists"
                value={list.id}
                defaultChecked={profile?.sourcingLists.includes(list.id) ?? false}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked ? [...current, list.id] : current.filter((id) => id !== list.id),
                  )
                }
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">{list.label}</span>
                <span className="block text-sm text-muted">{list.description}</span>
                {list.maxRadiusMiles < Math.max(...RADIUS_OPTIONS) ? (
                  <span className="mt-0.5 block text-sm text-muted">
                    Searches up to {list.maxRadiusMiles} miles.
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <FieldError message={errors.sourcingLists} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-medium">4. Narrow it down</h2>
          <span className="text-sm text-muted">Optional</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Applied after the properties come back, so it costs nothing and can be changed as often as you like. Leave
          it blank to see everything.
        </p>

        {showOptional ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="minPrice" className="block text-sm font-medium">
                  Lowest price
                </label>
                <input
                  id="minPrice"
                  name="minPrice"
                  inputMode="numeric"
                  defaultValue={profile?.minPrice ?? ''}
                  placeholder="80000"
                  className="figure mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <FieldError message={errors.minPrice} />
              </div>

              <div>
                <label htmlFor="maxPrice" className="block text-sm font-medium">
                  Highest price
                </label>
                <input
                  id="maxPrice"
                  name="maxPrice"
                  inputMode="numeric"
                  defaultValue={profile?.maxPrice ?? ''}
                  placeholder="250000"
                  className="figure mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <FieldError message={errors.maxPrice} />
              </div>
            </div>

            <div className="sm:w-1/2 sm:pr-2.5">
              <label htmlFor="minBedrooms" className="block text-sm font-medium">
                Fewest bedrooms
              </label>
              <input
                id="minBedrooms"
                name="minBedrooms"
                inputMode="numeric"
                defaultValue={profile?.minBedrooms ?? ''}
                placeholder="2"
                className="figure mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <FieldError message={errors.minBedrooms} />
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Property type</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((type) => (
                  <label
                    key={type.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      name="propertyTypes"
                      value={type.id}
                      defaultChecked={profile?.propertyTypes?.includes(type.id) ?? false}
                      className="size-4 accent-accent"
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowOptional(true)}
            className="mt-4 text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Add a price range, bedrooms or property type
          </button>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Submit isNew={isNew} />
        {!isNew ? (
          <span className="text-sm text-muted">
            Area and strategy changes used this month: {searchChangesUsed} of {searchChangeLimit}.
          </span>
        ) : null}
      </div>
    </form>
  )
}
