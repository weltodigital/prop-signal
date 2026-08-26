import type { PublishedDeal } from '@/lib/deals'
import type { TrackedDeal } from '@/lib/deal-progress'

/**
 * The four numbers the page leads with.
 *
 * A row of stat tiles rather than a chart: these are single current values, and
 * a one-bar bar chart of "6 properties" tells you nothing the number did not.
 *
 * Values use the font's proportional figures. Tabular is for columns that have
 * to align vertically, and at this size it makes a number like 121 read loose.
 */
function Tile({
  label,
  value,
  note,
  tone = 'plain',
}: {
  label: string
  value: string
  note?: string | null
  tone?: 'plain' | 'accent'
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="truncate text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'accent' ? 'text-accent' : 'text-ink'}`}>{value}</p>
      {note ? <p className="mt-0.5 truncate text-xs text-muted">{note}</p> : null}
    </div>
  )
}

export function DashboardStats({
  deals,
  tracked,
  newThisWeek,
}: {
  deals: PublishedDeal[]
  tracked: TrackedDeal[]
  newThisWeek: number
}) {
  if (deals.length === 0 && tracked.length === 0) return null

  const yields = deals
    .map((deal) =>
      deal.price && deal.enrichment.estimatedRent
        ? ((deal.enrichment.estimatedRent * 12) / deal.price) * 100
        : null,
    )
    .filter((value): value is number => value !== null)

  const bestYield = yields.length ? Math.max(...yields) : null
  const topScore = deals.length ? Math.max(...deals.map((deal) => deal.totalScore)) : null

  return (
    <div className="mt-6 grid grid-cols-2 divide-line rounded-lg border border-line bg-card sm:grid-cols-4 sm:divide-x">
      <Tile
        label="On your list"
        value={String(deals.length)}
        note={newThisWeek > 0 ? `${newThisWeek} new this week` : 'nothing new this week'}
      />
      <Tile
        label="Best score"
        value={topScore === null ? '—' : topScore.toFixed(0)}
        note={topScore === null ? null : 'out of 150'}
        tone="accent"
      />
      <Tile
        label="Best yield"
        value={bestYield === null ? '—' : `${bestYield.toFixed(1)}%`}
        note={bestYield === null ? 'no rent held yet' : 'gross, on the asking price'}
      />
      <Tile
        label="Being worked"
        value={String(tracked.length)}
        note={tracked.length ? 'in your deals' : 'nothing started'}
      />
    </div>
  )
}
