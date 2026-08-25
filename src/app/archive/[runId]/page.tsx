import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWeekByRunId } from '@/lib/deals'
import { currentStages } from '@/lib/deal-progress'
import { requireSubscriber } from '@/lib/require-subscriber'
import { formatDate } from '@/lib/format'
import { AppShell } from '@/components/app-shell'
import { DealCard } from '@/components/deal-card'
import { EmptyState, Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function ArchivedWeekPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { email } = await requireSubscriber(`/archive/${runId}`)

  // Row level security scopes the lookup, so another subscriber's week is not
  // found rather than forbidden.
  const week = await getWeekByRunId(runId)
  if (!week) notFound()

  // So a property you are already working does not read as untracked when you
  // open the week it first appeared in.
  const stages = await currentStages()

  return (
    <AppShell email={email}>
      <p className="text-sm text-muted">
        <Link href="/archive" className="underline underline-offset-4 hover:text-ink">
          Archive
        </Link>
      </p>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {week.kind === 'backfill' ? 'Your opening list' : `Week of ${formatDate(week.weekOf)}`}
      </h1>
      <p className="mt-2 text-sm text-muted">
        Published {formatDate(week.publishedAt)}. Every figure below is as it was observed then.
      </p>

      {week.isThin && week.thinReason ? (
        <div className="mt-6">
          <Notice tone="warn" title="A short list that week">
            <p>{week.thinReason}</p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {week.deals.length ? (
          week.deals.map((deal) => (
            <DealCard key={deal.propertyId} deal={deal} stage={stages.get(deal.propertyId)?.stage ?? null} />
          ))
        ) : (
          <EmptyState title="Nothing was published that week">
            <p>The run completed and nothing met the threshold.</p>
          </EmptyState>
        )}
      </div>
    </AppShell>
  )
}
