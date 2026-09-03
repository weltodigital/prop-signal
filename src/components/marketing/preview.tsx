/**
 * The product, drawn in markup.
 *
 * These are illustrations of the real interface rather than screenshots, so
 * they stay in step with it and cost nothing to load. The figures are an
 * example and are labelled as one — no real subscriber's list is reproduced
 * here, and there is never a listing photograph anywhere on this site.
 *
 * Nothing here is a card. A figure is the thing worth looking at, so the label
 * above it is small and quiet and the number below it is large and set in mono,
 * and the blocks are separated by hairline rules rather than by borders.
 */

import Image from 'next/image'
import studio from '@/assets/studio-flat-listing.jpg'

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="label border border-rule px-1.5 py-0.5 text-ink">{children}</span>
  )
}

/** The hero illustration: one entry as it appears on a Monday. */
export function DealPreview() {
  return (
    <div>
      <div className="flex items-start justify-between gap-8">
        <div className="flex min-w-0 gap-4">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-full ring-1 ring-rule">
            <Image src={studio} alt="" aria-hidden="true" fill sizes="3.5rem" className="object-cover" />
          </div>

          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <Tag>New</Tag>
              <span className="label text-ink">Reduced 12%</span>
            </p>
            <h3 className="mt-3 text-h3 font-medium">Little Lever Street, Northern Quarter</h3>
            <p className="mt-1 text-sm text-muted">
              <span className="figure">M1 1AR</span> · Studio · Flat
            </p>
          </div>
        </div>

        {/* A band rather than a number, the same as the real card. A score
            printed as a fraction gets read as a percentage, and the best
            property in an area should not arrive looking like a C. */}
        <div className="shrink-0 text-right">
          <p className="label text-muted">How it stacks</p>
          <p className="mt-1 text-3xl leading-none font-medium text-highlight-deep">Strong</p>
        </div>
      </div>

      {/* Why it is here, exactly as the real card says it. A demonstration
          that leads with a number is demonstrating the wrong product. */}
      <ul className="mt-6 space-y-1.5 border-t border-rule pt-6">
        {[
          '12% below nearby sold prices per sq ft',
          '£188 a month clear as a buy to let',
          'Reduced twice, 12% off its peak',
        ].map((reason) => (
          <li key={reason} className="flex gap-2.5 text-body">
            <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-highlight-deep" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 border-t border-rule pt-6 sm:grid-cols-3 lg:grid-cols-2">
        {[
          { label: 'Asking price', value: '£100,000', note: '£141 per sq ft' },
          { label: 'Estimated rent', value: '£725 a month', note: '8.7% gross on the asking price' },
          { label: 'Days on the market', value: '703', note: 'Price last moved 45 days ago' },
        ].map((figure) => (
          <div key={figure.label}>
            <dt className="label text-muted">{figure.label}</dt>
            <dd className="figure mt-1.5 text-2xl leading-tight whitespace-nowrap">{figure.value}</dd>
            <p className="mt-2 text-sm leading-relaxed text-muted">{figure.note}</p>
          </div>
        ))}
      </dl>

      <p className="mt-6 border-t border-rule pt-4 text-sm text-muted">Example listing</p>
    </div>
  )
}

/** The timeline, for the section about the diff. */
export function TimelinePreview() {
  const entries = [
    { label: 'Reduced 12%', detail: '£113,600 to £100,000', date: '10 Jul 2026', material: true, figure: true },
    { label: '365 days unsold', detail: 'Passed a year on the market', date: '12 Mar 2026', material: true, figure: false },
    { label: 'Back on the market', detail: 'Returned after coming off', date: '4 Jan 2026', material: true, figure: false },
  ]

  return (
    <div>
      <p className="label text-muted">Timeline</p>
      <p className="mt-2 text-sm text-muted">Every entry dated when it was observed.</p>

      <ol className="mt-5">
        {entries.map((entry) => (
          <li key={entry.label} className="relative border-t border-rule py-4 pl-6">
            <span
              aria-hidden="true"
              className={`absolute top-[1.3rem] left-0 h-1.5 w-1.5 ${
                entry.material ? 'bg-ink' : 'bg-rule'
              }`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-6">
              <p className={`text-base ${entry.material ? 'font-medium' : 'text-muted'}`}>{entry.label}</p>
              <p className="figure text-sm text-muted">{entry.date}</p>
            </div>
            <p className={`mt-1.5 leading-snug ${entry.figure ? 'figure text-base' : 'text-base text-muted'}`}>
              {entry.detail}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-6 border-t border-rule pt-4 text-sm text-muted">Example history</p>
    </div>
  )
}

/** The score breakdown, for the section about showing the working. */
export function ScorePreview() {
  const factors = [
    {
      label: 'Monthly cashflow',
      detail: '£188 a month clear, better than 80% of this week’s candidates',
      points: '32.0 / 40',
    },
    { label: 'Price against nearby sales', detail: '12.0% below what nearby homes sold for', points: '14.4 / 30' },
    { label: 'Local demand', detail: 'Area demand rated 54 out of 100', points: '8.5 / 15' },
    { label: 'Room to add value', detail: 'No floor area held', points: 'Not held' },
  ]

  return (
    <div>
      <p className="label text-muted">Quality</p>
      <p className="figure mt-1 text-5xl leading-none text-highlight-deep">64.9</p>

      <div className="mt-8">
        {factors.map((factor) => {
          const scored = factor.points !== 'Not held'
          return (
            <div
              key={factor.label}
              className="flex items-baseline justify-between gap-6 border-t border-rule py-5"
            >
              <div className="min-w-0">
                <p className={`text-base ${scored ? 'font-medium' : 'text-muted'}`}>{factor.label}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{factor.detail}</p>
              </div>
              <p
                className={`shrink-0 ${
                  scored ? 'figure text-xl leading-none' : 'label whitespace-nowrap text-muted'
                }`}
              >
                {factor.points}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-5 border-t border-rule pt-4 text-sm leading-relaxed text-muted">
        A factor with nothing behind it is left out rather than scored zero, and never stands in for an assumed
        average. The score is the share of what was actually held. Example figures.
      </p>
    </div>
  )
}
