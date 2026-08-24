import type { Risk } from '@/lib/deals'

/**
 * Flags, stated rather than scored.
 *
 * These do not move the ranking. Working out how many points an EPC of F is
 * worth against a 12% reduction would mean inventing a number, and this
 * codebase would rather show the fact and let the subscriber weigh it.
 */
export function RiskFlags({ risks }: { risks: Risk[] }) {
  if (!risks.length) return null

  return (
    <div className="mt-4 rounded-md border border-warn/30 bg-warn-soft px-4 py-3">
      <p className="text-sm font-medium">Worth knowing before you call</p>
      <ul className="mt-2 space-y-1.5">
        {risks.map((risk) => (
          <li key={risk.label} className="text-sm">
            <span className="font-medium">{risk.label}.</span> <span className="text-muted">{risk.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
