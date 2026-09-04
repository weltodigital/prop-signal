'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/components/ui'
import { PLAN_LIST } from '@/lib/plans'
import { ACKNOWLEDGEMENT_FIELD } from '@/lib/consumer-rights'

/**
 * The plans, and the acknowledgement that has to be ticked before any of them.
 *
 * One tick above three forms rather than three ticks. The forms stay separate —
 * a tier is a real choice made by pressing its own button, not a hidden field
 * somebody has to trust — so the acknowledgement is mirrored into each of them
 * as a hidden input, and the buttons are disabled until it is given.
 *
 * The disabling is a courtesy, not the control. Anybody can POST to
 * `/api/stripe/checkout` without ever loading this page, so the rule that
 * actually holds is in the route, which refuses a request that does not carry a
 * valid acknowledgement. This is here so nobody is surprised by that refusal.
 *
 * The wording is passed in from the server rather than written here, so the
 * words rendered and the words stored come from the same constant. See
 * `src/lib/consumer-rights.ts` for why that matters.
 */
export function PlanChoice({
  wording,
  version,
  chosenTier,
}: {
  wording: string
  version: string
  /** The tier the page arrived pointing at, so the recommendation survives. */
  chosenTier: string | null
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const checkboxId = useId()

  return (
    <>
      {/* Above the plans, not beside the button. This is the term somebody is
          agreeing to, and a term discovered after the decision is a term they
          did not really make. */}
      <Card className="mt-8">
        <label htmlFor={checkboxId} className="flex cursor-pointer gap-3">
          <input
            id={checkboxId}
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="text-sm">{wording}</span>
        </label>

        <p className="mt-3 text-sm text-muted">
          We build your first list within minutes of payment, which is why we have to ask. Cancelling from your
          account page still works at any time and stops the next payment — this is only about the 14-day right to
          unwind the purchase itself. The detail is in our{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
            terms of service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            privacy policy
          </Link>
          .
        </p>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const chosen = chosenTier === plan.id || (!chosenTier && plan.recommended)

          return (
            <Card key={plan.id} className={chosen ? 'border-highlight-deep/40 bg-tint' : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="label text-highlight-deep">{plan.label}</p>
                {plan.recommended ? <span className="label text-muted">Common</span> : null}
              </div>

              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="figure text-3xl font-semibold">£{plan.monthlyPrice}</span>
                <span className="text-sm text-muted">/mo</span>
              </p>

              <p className="mt-3 text-sm">
                <span className="figure font-medium">{plan.areas}</span>{' '}
                {plan.areas === 1 ? 'area' : 'separate areas'}
              </p>
              <p className="mt-1 text-sm text-muted">{plan.summary}</p>

              <form action="/api/stripe/checkout" method="post" className="mt-6">
                <input type="hidden" name="tier" value={plan.id} />
                {/* The version, never the wording. The server resolves one to
                    the other, so what is stored is what we would have shown
                    rather than whatever arrived in the request. */}
                <input type="hidden" name={`${ACKNOWLEDGEMENT_FIELD}Version`} value={version} />
                {acknowledged ? <input type="hidden" name={ACKNOWLEDGEMENT_FIELD} value="on" /> : null}

                <Button type="submit" variant={chosen ? 'primary' : 'secondary'} disabled={!acknowledged}>
                  Choose {plan.label}
                </Button>
              </form>
            </Card>
          )
        })}
      </div>

      {!acknowledged ? (
        <p className="mt-3 text-sm text-muted" role="status">
          Tick the box above to continue to payment.
        </p>
      ) : null}
    </>
  )
}
