import type { ScoreFactor } from '@/lib/deals'

/**
 * How the score was arrived at, line by line.
 *
 * Shown in full rather than summarised. A factor with nothing behind it says
 * which figure is missing and takes no part in the score — the scoring omits
 * rather than estimates, and hiding the omission here would undo that.
 *
 * Each line shows the points it earned out of the points it could have. They
 * do not add up to the score above them, because the score is the share of
 * what was available rather than the raw sum: a property missing one figure is
 * measured on the rest rather than carrying a zero for it.
 */
function FactorRow({ factor }: { factor: ScoreFactor }) {
  // Undefined on scores published before v3, where every factor was available.
  const available = factor.available ?? null
  const held = available === null || available > 0
  const scored = held && factor.points > 0

  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <p className={`text-sm ${scored ? 'font-medium' : 'text-muted'}`}>{factor.label}</p>
        <p className="text-sm text-muted">{factor.detail}</p>
      </div>
      <p className={`nums shrink-0 text-sm ${scored ? 'font-medium' : 'text-muted'}`}>
        {!held ? 'Not held' : available === null ? (scored ? `+${factor.points.toFixed(1)}` : '0') : `${factor.points.toFixed(1)} / ${available}`}
      </p>
    </div>
  )
}

export function ScoreBreakdown({
  quality,
  movement,
  qualityScore,
  movementScore,
  version,
}: {
  quality: ScoreFactor[]
  movement: ScoreFactor[]
  qualityScore: number
  movementScore: number
  version: string
}) {
  if (!quality.length && !movement.length) {
    return <p className="text-sm text-muted">No breakdown was stored for this one.</p>
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section>
        <h4 className="flex items-baseline justify-between gap-2 text-sm font-medium">
          Quality
          <span className="nums text-muted">{qualityScore.toFixed(1)}</span>
        </h4>
        <p className="mt-1 text-sm text-muted">
          Whether the property is any good, ignoring whether it has moved. Out of 100, over the factors we hold a
          figure for.
        </p>
        <div className="mt-3">
          {quality.map((factor) => (
            <FactorRow key={factor.label} factor={factor} />
          ))}
        </div>
      </section>

      <section>
        <h4 className="flex items-baseline justify-between gap-2 text-sm font-medium">
          Movement
          <span className="nums text-muted">{movementScore.toFixed(1)}</span>
        </h4>
        <p className="mt-1 text-sm text-muted">
          How hard and how recently it moved. Out of 100, and this is what puts it on the list.
        </p>
        <div className="mt-3">
          {movement.length ? (
            movement.map((factor) => <FactorRow key={factor.label} factor={factor} />)
          ) : (
            <p className="py-2 text-sm text-muted">Nothing has moved. It is here on quality alone.</p>
          )}
        </div>
      </section>

      <p className="text-sm text-muted sm:col-span-2">
        The two are added, not blended. {qualityScore.toFixed(1)} and {movementScore.toFixed(1)}, out of 200, so a
        mediocre property that has just dropped can outrank a good one that has not moved. Cashflow is scored against
        the other properties in your week rather than a fixed figure, because £300 a month clear means something
        different in Salford and in Surrey. Scoring {version}.
      </p>
    </div>
  )
}
