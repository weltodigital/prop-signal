'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'

type Phase = 'starting' | 'working' | 'done' | 'failed'

const MESSAGES: Record<Phase, string> = {
  starting: 'Building your opening list',
  working: 'Building your opening list',
  done: 'Your list is ready',
  failed: 'That did not finish',
}

/**
 * The opening backfill, run while the subscriber watches.
 *
 * Sourcing a whole area is a few minutes of rate-limited calls, so this is the
 * one place in the product where somebody waits. Telling them what is happening
 * is better than a spinner, and far better than an empty dashboard until Sunday.
 *
 * It posts once. The route refuses a second run for the same profile, so a
 * refresh mid-run cannot buy the list twice, but not asking is cheaper than
 * being refused.
 */
export function FirstRun() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('starting')
  const [detail, setDetail] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    async function go() {
      setPhase('working')

      try {
        const response = await fetch('/api/runs/first', { method: 'POST' })
        const body = (await response.json()) as {
          ok?: boolean
          status?: string
          dealsSelected?: number
          error?: string
        }

        if (cancelled) return

        if (body.status === 'already_running') {
          setDetail('A run is already going. This page will catch up when it finishes.')
          setPhase('working')
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

  return (
    <Card className="mt-8">
      <div className="flex items-start gap-3">
        {phase === 'working' || phase === 'starting' ? (
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
          />
        ) : null}

        <div>
          <p className="font-medium" role="status">
            {MESSAGES[phase]}
          </p>

          {phase === 'working' || phase === 'starting' ? (
            <p className="mt-2 max-w-prose text-sm text-muted">
              We are going through everything standing in your area, not only what appeared this week, and scoring it
              against your strategy. It takes a few minutes because we are limited to a handful of data calls every
              ten seconds. You can leave this page and come back.
            </p>
          ) : null}

          {detail ? <p className="mt-2 max-w-prose text-sm text-muted">{detail}</p> : null}

          {phase === 'failed' ? (
            <button
              type="button"
              onClick={() => {
                started.current = false
                setDetail(null)
                setPhase('starting')
                router.refresh()
              }}
              className="mt-3 rounded-md border border-line bg-card px-3 py-1.5 text-sm hover:border-accent/30 hover:text-accent"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
