'use client'

import { useOptimistic, useTransition } from 'react'
import { setStageAction, untrackAction } from '@/app/(app)/deals/actions'
import {
  EXIT_STAGES,
  FORWARD_STAGES,
  nextStage,
  STAGE_DEFINITIONS,
  type DealStage,
} from '@/lib/deal-stages'

/**
 * Where a deal has got to, and the one button that moves it on.
 *
 * Optimistic, for the same reason the star is: moving a deal from Contacted to
 * Viewing is a decision somebody has already made, and waiting on a round trip
 * to see it makes the app feel like it is thinking about whether to agree. The
 * stage changes immediately and the write follows. Nothing here costs a credit.
 *
 * The common move gets a button and the rest get a select, because in practice
 * a deal goes forward one step at a time and everything else is a correction.
 */
export function StageControl({
  propertyId,
  stage,
  compact = false,
}: {
  propertyId: string
  stage: DealStage | null
  /** Card view: the forward button and nothing else, to keep rows short. */
  compact?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(stage)

  const move = (to: DealStage) =>
    startTransition(async () => {
      setOptimistic(to)
      const data = new FormData()
      data.set('propertyId', propertyId)
      data.set('stage', to)
      await setStageAction(data)
    })

  const current = optimistic ? STAGE_DEFINITIONS[optimistic] : null
  const onwards = optimistic ? nextStage(optimistic) : 'interested'

  const chrome = `rounded-md border px-2.5 py-1.5 text-sm transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    pending ? 'opacity-70' : ''
  }`

  if (!optimistic) {
    return (
      <button
        type="button"
        onClick={() => move('interested')}
        className={`${chrome} border-line text-muted hover:border-highlight-deep/40 hover:text-highlight-deep`}
      >
        Track this
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
          current?.lost
            ? 'border-line text-muted'
            : 'border-highlight-deep/40 font-medium text-highlight-deep'
        }`}
      >
        {current?.label}
      </span>

      {onwards ? (
        <button
          type="button"
          onClick={() => move(onwards)}
          className={`${chrome} border-line text-muted hover:border-highlight-deep/40 hover:text-highlight-deep`}
        >
          → {STAGE_DEFINITIONS[onwards].label}
        </button>
      ) : null}

      {compact ? null : (
        <>
          {/* Everything else: a correction, a jump, or one of the two exits. */}
          <label htmlFor={`stage-${propertyId}`} className="sr-only">
            Move this deal to another stage
          </label>
          <select
            id={`stage-${propertyId}`}
            value={optimistic}
            onChange={(event) => move(event.target.value as DealStage)}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm text-muted outline-none transition-colors focus:border-highlight-deep focus:ring-2 focus:ring-highlight-deep/20"
          >
            <optgroup label="Progress">
              {FORWARD_STAGES.map((id) => (
                <option key={id} value={id}>
                  {STAGE_DEFINITIONS[id].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Out">
              {EXIT_STAGES.map((id) => (
                <option key={id} value={id}>
                  {STAGE_DEFINITIONS[id].label}
                </option>
              ))}
            </optgroup>
          </select>

          {/* Untracking is for a mis-click. A deal that died should be passed
              or marked fallen through, so the record keeps saying what happened. */}
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                setOptimistic(null)
                const data = new FormData()
                data.set('propertyId', propertyId)
                await untrackAction(data)
              })
            }
            title="Remove this from your deals. Use Passed or Fell through for a deal that ended."
            className="rounded-md px-1.5 py-1.5 text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Untrack
          </button>
        </>
      )}
    </div>
  )
}
