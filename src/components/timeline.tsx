import type { TimelineEntry } from '@/lib/deals'
import { formatDate, formatMoney, formatPercent, formatShortDate } from '@/lib/format'

/**
 * Everything we have ever observed about one property, newest first.
 *
 * Every entry is labelled with the date the data behind it was observed, not
 * the date the row was written. Where a move was read out of the price history
 * rather than watched happening, the entry says when we learned of it — the
 * distinction between what we saw and what we were told matters, and collapsing
 * the two would be the easiest lie in the product.
 */

function Entry({ entry }: { entry: TimelineEntry }) {
  const moved = entry.previousPrice !== null && entry.currentPrice !== null

  return (
    <li className="relative border-t border-line py-4 pl-6">
      <span
        aria-hidden="true"
        className={`absolute top-[1.55rem] left-0 h-1.5 w-1.5 ${
          entry.isMaterial ? 'bg-ink' : 'bg-line'
        }`}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className={`text-base ${entry.isMaterial ? 'font-medium' : 'text-muted'}`}>{entry.label}</p>
        <p className="figure text-sm text-muted">{formatDate(entry.observedAt)}</p>
      </div>

      {moved ? (
        <p className="figure mt-2 text-lg leading-none">
          {formatMoney(entry.previousPrice)} to {formatMoney(entry.currentPrice)}
          {entry.magnitude === null ? '' : `, ${formatPercent(Math.abs(entry.magnitude))}`}
        </p>
      ) : null}

      {entry.learnedAt ? (
        <p className="mt-1 text-sm text-muted">
          Dated when it happened, from the price history. We learned of it on {formatShortDate(entry.learnedAt)}.
        </p>
      ) : null}

      {!entry.isMaterial ? (
        <p className="mt-1 text-sm text-muted">Recorded, but not on its own a reason to put this in front of you.</p>
      ) : null}
    </li>
  )
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return <p className="text-sm text-muted">Nothing has been observed about this property yet.</p>
  }

  return (
    <ol className="mt-2">
      {entries.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}
