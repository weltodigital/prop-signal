import { setStageAction, untrackAction } from '@/app/deals/actions'
import {
  DEAL_STAGES,
  EXIT_STAGES,
  FORWARD_STAGES,
  nextStage,
  STAGE_DEFINITIONS,
  type DealStage,
} from '@/lib/deal-stages'

/**
 * Where a deal has got to, and the one button that moves it on.
 *
 * Plain forms posting to server functions, so it works before any JavaScript
 * has loaded and there is no client bundle behind it — the same way the star
 * does. Nothing here can cost a credit: it is the subscriber's record of their
 * own actions and touches no API.
 *
 * The common move gets a button and the rest get a select, because in practice
 * a deal goes forward one step at a time and everything else is a correction.
 */
export function StageControl({ propertyId, stage }: { propertyId: string; stage: DealStage | null }) {
  const current = stage ? STAGE_DEFINITIONS[stage] : null
  const onwards = stage ? nextStage(stage) : 'interested'

  if (!stage) {
    return (
      <form action={setStageAction} className="inline-flex">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="stage" value="interested" />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/30 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Track this
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-sm ${
          current?.lost
            ? 'border-line bg-paper text-muted'
            : current?.terminal
              ? 'border-accent/30 bg-accent-soft text-accent'
              : 'border-accent/30 bg-accent-soft text-accent'
        }`}
      >
        {current?.label}
      </span>

      {onwards ? (
        <form action={setStageAction} className="inline-flex">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="stage" value={onwards} />
          <button
            type="submit"
            className="inline-flex items-center rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/30 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            → {STAGE_DEFINITIONS[onwards].label}
          </button>
        </form>
      ) : null}

      {/* Everything else: a correction, a jump, or one of the two exits. A
          submit button beside the select keeps it working without JavaScript. */}
      <form action={setStageAction} className="inline-flex items-center gap-1.5">
        <input type="hidden" name="propertyId" value={propertyId} />
        <label htmlFor={`stage-${propertyId}`} className="sr-only">
          Move this deal to another stage
        </label>
        <select
          id={`stage-${propertyId}`}
          name="stage"
          defaultValue={stage}
          className="rounded-md border border-line bg-card px-2 py-1.5 text-sm text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
        <button
          type="submit"
          className="rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/30 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Move
        </button>
      </form>

      {/* Untracking is for a mis-click. A deal that died should be passed or
          marked fallen through, so the record keeps saying what happened. */}
      <form action={untrackAction} className="inline-flex">
        <input type="hidden" name="propertyId" value={propertyId} />
        <button
          type="submit"
          title="Remove this from your deals. Use Passed or Fell through for a deal that ended."
          className="rounded-md px-1.5 py-1.5 text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Untrack
        </button>
      </form>
    </div>
  )
}

/** Every stage, for a legend or a summary row. */
export const ALL_STAGES = DEAL_STAGES
