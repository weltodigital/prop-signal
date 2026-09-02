'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ButtonLink, Card, Notice } from '@/components/ui'

type Phase = 'working' | 'done' | 'failed'

type Result = {
  candidates: number
  matching: number
  capped: boolean
  thin: boolean
  postcode: string
  radiusMiles: number
}

/**
 * How many properties the area holds, before anybody is asked for a card.
 *
 * This is the screen that stops the one complaint this product could not
 * answer: somebody in a quiet market paying £29 and getting a list of two.
 * They still might get a list of two — that is the market, and the product has
 * always said it would rather show two than pad — but they will have known
 * before they paid, and they will have been offered the radius first.
 *
 * It runs one sourcing call. Repeating the same search costs nothing, because
 * the answer is stored, so a refresh or a back button is free.
 *
 * Nothing here blocks the subscription. A failed check offers the way on,
 * because somebody who wants to subscribe without the number is entitled to.
 */
export function AreaCheck({ initial }: { initial: Result | null }) {
  const [phase, setPhase] = useState<Phase>(initial ? 'done' : 'working')
  const [result, setResult] = useState<Result | null>(initial)
  const [detail, setDetail] = useState<string | null>(null)
  const started = useRef(Boolean(initial))

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    async function go() {
      try {
        const response = await fetch('/api/search/probe', { method: 'POST' })
        const body = await response.json()
        if (cancelled) return

        if (response.ok && body.status === 'ok') {
          setResult(body as Result)
          setPhase('done')
          return
        }

        setPhase('failed')
        setDetail(typeof body.error === 'string' ? body.error : 'We could not check your area just now.')
      } catch {
        if (cancelled) return
        setPhase('failed')
        setDetail('The connection dropped before it finished.')
      }
    }

    void go()
    return () => {
      cancelled = true
    }
  }, [])

  if (phase === 'working') {
    return (
      <Card>
        <p className="font-medium" role="status" aria-live="polite">
          Counting what is in your area
        </p>
        <div className="track mt-3 h-1" aria-hidden="true" />
        <p className="mt-4 max-w-prose text-sm text-muted">
          One search of the lists you picked, around your postcode. A few seconds, and nothing is charged for it.
        </p>
      </Card>
    )
  }

  if (phase === 'failed' || !result) {
    return (
      <Card>
        <p className="font-medium">We could not check your area</p>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {detail} This does not stop you subscribing — it is a courtesy check, and your first list is built from
          everything standing in your area either way.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/subscribe">Continue to payment</ButtonLink>
          <ButtonLink href="/onboarding" variant="secondary">
            Change the search
          </ButtonLink>
        </div>
      </Card>
    )
  }

  const { matching, candidates, capped, thin, postcode, radiusMiles } = result
  const filtered = matching !== candidates
  const area = `${postcode}, within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`

  return (
    <>
      <Card>
        <p className="label text-muted">In your area right now</p>
        <p className="figure mt-2 text-5xl leading-none text-highlight-deep">
          {capped ? `${matching}+` : matching}
        </p>
        <p className="mt-3 max-w-prose text-body">
          {capped
            ? `More than ${matching} properties on the lists you picked around ${area}. We stopped counting there.`
            : `${matching} ${matching === 1 ? 'property' : 'properties'} on the lists you picked around ${area}.`}
        </p>

        {filtered ? (
          <p className="mt-2 max-w-prose text-sm text-muted">
            {candidates} before your price, bedroom and type filters. Those are free to change and can be changed as
            often as you like.
          </p>
        ) : null}

        {/* Said plainly, because the alternative is letting somebody read a
            stock count as a promise about their list. */}
        <p className="mt-4 max-w-prose text-sm text-muted">
          This is the stock your search has to work with, not the size of your list. Most of it will not clear the
          quality floor — filtering is the product — so expect a fraction of this to reach you.
        </p>
      </Card>

      {thin ? (
        <div className="mt-6">
          <Notice tone="warn" title="That is a thin area at this radius">
            <p>
              We would rather say so now than take £29 and hand you a list of two. The radius is the biggest thing you
              control: widening it to the next step or two usually changes this figure a great deal, and it costs you
              nothing to try.
            </p>
            <p className="mt-3">
              If you know your area and you are happy with it, carry on — a short list of deals that stack is still
              what we would rather give you than a long one that does not.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {thin ? (
          <>
            <ButtonLink href="/onboarding">Widen my search</ButtonLink>
            <ButtonLink href="/subscribe" variant="secondary">
              Subscribe anyway
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink href="/subscribe">Continue to payment</ButtonLink>
            <Link href="/onboarding" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              Change the search
            </Link>
          </>
        )}
      </div>
    </>
  )
}

/** Kept out of the component so the page can render the same wording server-side. */
export function ProbeExhausted({ used, limit }: { used: number; limit: number }) {
  return (
    <Card>
      <p className="font-medium">You have used your area checks for this month</p>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {used} of {limit}. Each one is a live search of the property market, which is why there is a limit at all. It
        resets with your billing period, and nothing about it stops you subscribing.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href="/subscribe">Continue to payment</ButtonLink>
        <ButtonLink href="/onboarding" variant="secondary">
          Change the search
        </ButtonLink>
      </div>
    </Card>
  )
}
