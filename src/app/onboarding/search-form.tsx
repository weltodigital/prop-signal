'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveSearch, type OnboardingState } from './actions'
import { Button, Card } from '@/components/ui'
import { PROPERTY_TYPES, RADIUS_OPTIONS, type SearchProfile, type SourcingList } from '@/lib/search-profile.types'
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
  // PropertyData cap the radius per list and reject the whole call above it, so
  // the options narrow as strategies are ticked rather than failing on Sunday.
  const [chosen, setChosen] = useState<string[]>(profile?.sourcingLists ?? [])
  const maxRadius = Math.min(
    ...sourcingLists.filter((list) => chosen.includes(list.id)).map((list) => list.maxRadiusMiles),
    Math.max(...RADIUS_OPTIONS),
  )

  // Which strategies are ticked decides which figures we have to ask for. A
  // BRRR needs a refurb cost and a short let needs a nightly rate, because
  // PropertyData publish neither and this product will not invent them.
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>(
    profile?.investmentStrategies ?? ['btl'],
  )
  const needsRefurb = strategies.includes('brrr')
  const needsNightly = strategies.includes('r2sa')

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
              defaultValue={profile?.radiusMiles ?? 10}
              className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {RADIUS_OPTIONS.filter((miles) => miles <= maxRadius).map((miles) => (
                <option key={miles} value={miles}>
                  {miles} {miles === 1 ? 'mile' : 'miles'}
                </option>
              ))}
            </select>
            <FieldError message={errors.radiusMiles} />
            {maxRadius < Math.max(...RADIUS_OPTIONS) ? (
              <p className="mt-1.5 text-sm text-muted">
                Capped at {maxRadius} miles by one of the strategies you have chosen.
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

        {needsRefurb || needsNightly ? (
          <div className="mt-6 space-y-5 rounded-md border border-line bg-paper p-4">
            <div>
              <p className="text-sm font-medium">Your own figures</p>
              <p className="mt-1 text-sm text-muted">
                We do not hold these and will not guess them. PropertyData publish no refurbishment cost and no
                nightly rate, and an assumed average inside a score is the thing this product refuses everywhere
                else. You know your own numbers better than any data feed does.
              </p>
            </div>

            {needsRefurb ? (
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
                  defaultValue={profile?.assumptions.refurbCostPerSqFt ?? ''}
                  className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="65"
                />
                <p className="mt-1 text-sm text-muted">What your builder charges, in pounds. Used with the floor area.</p>
                <FieldError message={errors.assumptions} />
              </div>
            ) : null}

            {needsNightly ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="nightlyRate" className="block text-sm font-medium">
                    Nightly rate
                  </label>
                  <input
                    id="nightlyRate"
                    name="nightlyRate"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    defaultValue={profile?.assumptions.nightlyRate ?? ''}
                    className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    placeholder="110"
                  />
                </div>
                <div>
                  <label htmlFor="occupancyPercent" className="block text-sm font-medium">
                    Occupancy, %
                  </label>
                  <input
                    id="occupancyPercent"
                    name="occupancyPercent"
                    type="number"
                    min="1"
                    max="100"
                    inputMode="numeric"
                    defaultValue={profile?.assumptions.occupancyPercent ?? ''}
                    className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    placeholder="65"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-medium">3. What to look for</h2>
        <p className="mt-1 text-sm text-muted">
          Which situations you want pulled out of the market. Pick as many as apply. More lists means a wider net, not
          a longer list. You still get five.
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
                  className="nums mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
                  className="nums mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
                className="nums mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
