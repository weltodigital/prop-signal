import type { Risk } from '@/lib/deals'

/**
 * Flags, still never scored.
 *
 * Working out how many points an EPC of F is worth against a 12% reduction
 * would mean inventing a number. But a note on its own let a G-rated house on
 * a flood plain lead the week, so a risk now carries a severity: the worst are
 * kept off the list entirely, and the next worst hold a property's total below
 * a ceiling. Neither adjusts a factor, so nothing invented reaches the ranking.
 */
export function RiskFlags({ risks, compact = false }: { risks: Risk[]; compact?: boolean }) {
  if (!risks.length) return null

  const capped = risks.some((risk) => risk.severity === 'cap')

  // On a card, a bordered panel per property turns a scannable list into a wall
  // of warnings. The flag still shows; the explanation waits for the hover or
  // the property page, where somebody has already stopped to read.
  if (compact) {
    return (
      <p className="mt-1.5 flex flex-wrap gap-1.5">
        {risks.map((risk) => (
          <span
            key={risk.label}
            title={risk.detail}
            className="label cursor-help border border-warn/40 px-1.5 py-0.5 text-warn"
          >
            {risk.label}
          </span>
        ))}
      </p>
    )
  }

  return (
    <div className="mt-4 border-l-2 border-warn/50 py-1 pl-4">
      <p className="text-sm font-medium">Worth knowing before you call</p>
      <ul className="mt-2 space-y-1.5">
        {risks.map((risk) => (
          <li key={risk.label} className="text-sm">
            <span className="font-medium">{risk.label}.</span> <span className="text-muted">{risk.detail}</span>
            {risk.severity === 'cap' ? (
              <span className="label ml-1.5 border border-warn/40 px-1.5 py-0.5 text-muted">
                Held back
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {capped ? (
        <p className="mt-2 text-sm text-muted">
          This one is ranked below where its figures alone would put it. It is here because it still cleared the bar,
          not because it is this week&rsquo;s best.
        </p>
      ) : null}
    </div>
  )
}
