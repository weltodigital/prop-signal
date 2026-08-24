import type { ScoreFactor } from '@/lib/deals'

/**
 * How the score was arrived at, line by line.
 *
 * Shown in full rather than summarised. A factor with nothing behind it scores
 * nothing and says which figure is missing — the scoring omits rather than
 * estimates, and hiding the omission here would undo that.
 */
function FactorRow({ factor }: { factor: ScoreFactor }) {
  const scored = factor.points > 0

  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <p className={`text-sm ${scored ? 'font-medium' : 'text-muted'}`}>{factor.label}</p>
        <p className="text-sm text-muted">{factor.detail}</p>
      </div>
      <p className={`nums shrink-0 text-sm ${scored ? 'font-medium' : 'text-muted'}`}>
        {scored ? `+${factor.points.toFixed(1)}` : '0'}
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
        <p className="mt-1 text-sm text-muted">Whether the property is any good, ignoring whether it has moved.</p>
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
        <p className="mt-1 text-sm text-muted">How hard and how recently it moved. This is what puts it on the list.</p>
        <div className="mt-3">
          {movement.length ? (
            movement.map((factor) => <FactorRow key={factor.label} factor={factor} />)
          ) : (
            <p className="py-2 text-sm text-muted">Nothing has moved. It is here on quality alone.</p>
          )}
        </div>
      </section>

      <p className="text-sm text-muted sm:col-span-2">
        The two are added, not blended, so a mediocre property that has just dropped can outrank a good one that has
        not moved. Scoring {version}.
      </p>
    </div>
  )
}
