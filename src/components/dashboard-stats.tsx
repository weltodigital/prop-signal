import type { PublishedDeal } from '@/lib/deals'
import type { TrackedDeal } from '@/lib/deal-progress'
import { CountUp, Meter } from '@/components/motion-ui'
import { BAND_COUNT, scoreBand } from '@/lib/score-band'

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
  count,
  decimals = 0,
  suffix = '',
  share,
  note,
  tone = 'plain',
  word = false,
}: {
  label: string
  /** Printed as-is where there is no figure to count, like an em dash. */
  value?: string
  /** The figure, where there is one. Counts up on arrival. */
  count?: number
  decimals?: number
  suffix?: string
  /** Where the figure has a real ceiling, the bar that shows it against one. */
  share?: number
  note?: string | null
  tone?: 'plain' | 'accent'
  /** A word rather than a figure. Sized to fit one, and not set in figures. */
  word?: boolean
}) {
  return (
    <div className="min-w-0 border-t border-line pt-4">
      <p className="label truncate text-muted">{label}</p>
      <p
        className={`mt-1.5 leading-none ${word ? 'truncate text-2xl font-medium' : 'figure text-3xl'} ${
          tone === 'accent' ? 'text-highlight-deep' : 'text-ink'
        }`}
      >
        {count === undefined ? value : <CountUp value={count} decimals={decimals} suffix={suffix} />}
      </p>
      {share !== undefined ? (
        <Meter
          share={share}
          trackClassName="mt-3 h-[3px] w-full bg-line"
          className={`h-full ${tone === 'accent' ? 'bg-highlight-deep' : 'bg-ink/70'}`}
        />
      ) : null}
      {note ? <p className="mt-2 text-sm leading-snug text-muted">{note}</p> : null}
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
  const topBand = topScore === null ? null : scoreBand(topScore)

  return (
    <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
      <Tile
        label="On your list"
        count={deals.length}
        note={newThisWeek > 0 ? `${newThisWeek} new this week` : 'nothing new this week'}
      />
      {/* The band rather than the fraction, for the reason in `score-band.ts`:
          a score printed out of 150 is read as a percentage, and the top
          property in somebody's area kept reading as a C. The bar fills by
          band, so it says the same thing the word does. */}
      <Tile
        label="Best on your list"
        value={topBand ? topBand.label : '—'}
        share={topBand ? topBand.rank / BAND_COUNT : undefined}
        note={topBand ? topBand.note : null}
        tone="accent"
        word
      />
      <Tile
        label="Best yield"
        value="—"
        count={bestYield ?? undefined}
        decimals={1}
        suffix="%"
        note={bestYield === null ? 'no rent held yet' : 'gross, on the asking price'}
      />
      <Tile
        label="In your pipeline"
        count={tracked.length}
        note={tracked.length ? 'in your pipeline' : 'nothing started'}
      />
    </div>
  )
}
