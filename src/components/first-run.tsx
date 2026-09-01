'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'

type Phase = 'working' | 'done' | 'failed'

/**
 * What the run is doing, in the order it does it.
 *
 * Real steps, not decoration. There is no progress to report — the run does not
 * tell the browser where it has got to — so this describes the work rather than
 * claiming a percentage. A bar that invents a number is worse than one that
 * only says "still going".
 */
const STEPS = [
  'Searching every listing in your area',
  'Reading the price history on each one',
  'Pulling local rents and sold prices',
  'Scoring them against your strategy',
  'Ranking what actually stacks',
] as const

/**
 * The first search, run while the subscriber watches.
 *
 * It takes a few minutes, so this is the one place in the product where
 * somebody waits. Telling them what is happening beats a spinner, and both beat
 * an empty dashboard until Sunday.
 *
 * It posts once. The route refuses a second run for the same profile, so a
 * refresh mid-run cannot repeat the work.
 */
export function FirstRun() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('working')
  const [detail, setDetail] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(false)

  // The step and the clock only move while there is something to wait for.
  useEffect(() => {
    if (phase !== 'working') return

    const stepper = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 9_000)
    const clock = setInterval(() => setElapsed((n) => n + 1), 1_000)

    return () => {
      clearInterval(stepper)
      clearInterval(clock)
    }
  }, [phase])

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    async function go() {
      try {
        const response = await fetch('/api/runs/first', { method: 'POST' })
        const body = (await response.json()) as { ok?: boolean; status?: string; error?: string }

        if (cancelled) return

        if (body.status === 'already_running') {
          setDetail('A search is already going. This page will catch up when it finishes.')
          setTimeout(() => router.refresh(), 20_000)
          return
        }

        if (response.ok && body.ok !== false) {
          setPhase('done')
          router.refresh()
          return
        }

        setPhase('failed')
        setDetail(body.error ?? 'Something went wrong on our side.')
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
  }, [router])

  if (phase === 'failed') {
    return (
      <Card className="mt-8">
        <p className="font-medium">That did not finish</p>
        {detail ? <p className="mt-2 max-w-prose text-sm text-muted">{detail}</p> : null}
        <button
          type="button"
          onClick={() => {
            started.current = false
            setDetail(null)
            setPhase('working')
            router.refresh()
          }}
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm transition-colors hover:border-highlight-deep/40 hover:text-highlight-deep"
        >
          Try again
        </button>
      </Card>
    )
  }

  if (phase === 'done') {
    return (
      <Card className="animate-in mt-8">
        <p className="font-medium">Your list is ready</p>
      </Card>
    )
  }

  return (
    <Card className="mt-8 overflow-hidden">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium" role="status" aria-live="polite">
          Searching your area
        </p>
        <p className="figure text-sm text-muted" aria-hidden="true">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </p>
      </div>

      <div className="track mt-3 h-1" aria-hidden="true" />

      {/* The steps, with the ones behind us kept visible. Somebody who looks
          back should be able to see what has already been done. */}
      <ol className="mt-4 space-y-1.5 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 transition-opacity duration-300 ${
              index > step ? 'opacity-35' : 'opacity-100'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block size-1.5 shrink-0 rounded-full transition-colors ${
                index < step ? 'bg-accent' : index === step ? 'bg-highlight' : 'bg-line'
              }`}
            />
            <span className={index === step ? 'text-ink' : 'text-muted'}>{label}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 max-w-prose text-sm text-muted">
        {detail ??
          'We look at everything standing in your area, not only what appeared this week. It usually takes a few minutes, and you can leave this page and come back to it.'}
      </p>
    </Card>
  )
}
