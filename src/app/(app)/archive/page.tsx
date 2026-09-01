import Link from 'next/link'
import { listPublishedWeeks } from '@/lib/deals'
import { requireSubscriber } from '@/lib/require-subscriber'
import { formatDate } from '@/lib/format'
import { Card, EmptyState } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Previous weeks.
 *
 * Summaries only. The deals are read when a week is opened, so this stays one
 * query however many weeks accumulate.
 */
export default async function ArchivePage() {
  const { email } = await requireSubscriber('/archive')
  const weeks = await listPublishedWeeks()

  return (
    <>
      <h1 className="font-display text-h2 font-normal">Archive</h1>
      <p className="mt-2 text-sm text-muted">
        Every list published to you. The figures in an old week are what we observed then and have not been updated
        since. That is what makes them worth keeping.
      </p>

      <div className="mt-8 space-y-3">
        {weeks.length === 0 ? (
          <EmptyState title="Nothing has been published yet">
            <p>Your first list is built by the Sunday run and appears on Monday morning.</p>
          </EmptyState>
        ) : (
          weeks.map((week) => (
            <Card key={week.runId} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <div>
                  <h2 className="text-base font-medium">
                    <Link href={`/archive/${week.runId}`} className="hover:text-highlight-deep">
                      {week.kind === 'backfill' ? 'Opening list' : `Week of ${formatDate(week.weekOf)}`}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Published {formatDate(week.publishedAt)}
                    {week.isThin && week.thinReason ? ` · ${week.thinReason}` : ''}
                  </p>
                </div>

                <p className="figure text-sm text-muted">
                  {week.dealCount} {week.dealCount === 1 ? 'property' : 'properties'}
                </p>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
