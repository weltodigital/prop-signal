/**
 * The product, drawn in markup.
 *
 * These are illustrations of the real interface rather than screenshots, so
 * they stay in step with it and cost nothing to load. The figures are an
 * example and are labelled as one — no real subscriber's list is reproduced
 * here, and there is never a listing photograph anywhere on this site.
 */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium tracking-wide text-white uppercase">
      {children}
    </span>
  )
}

/** The hero illustration: one entry as it appears on a Monday. */
export function DealPreview() {
  return (
    <div className="rounded-xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(13,27,47,0.04),0_12px_32px_-12px_rgba(13,27,47,0.18)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-accent">
            <Pill>New</Pill>
            Reduced 12%
          </p>
          <h3 className="mt-1.5 text-lg font-medium">Little Lever Street, Northern Quarter</h3>
          <p className="mt-0.5 text-sm text-muted">M1 1AR · Studio · Flat</p>
        </div>
        <span className="nums shrink-0 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted">Score 71</span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {[
          { label: 'Asking price', value: '£100,000', note: '8.2% below the estimate' },
          { label: 'Estimated rent', value: '£725 a month', note: '8.7% gross yield' },
          { label: 'Days on the market', value: '703', note: 'Price last moved 45 days ago' },
        ].map((figure) => (
          <div key={figure.label}>
            <dt className="text-sm text-muted">{figure.label}</dt>
            <dd className="nums text-base font-medium">{figure.value}</dd>
            <p className="text-sm text-muted">{figure.note}</p>
          </div>
        ))}
      </dl>

      <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
        Observed 24 Aug 2026. An example entry, not a live listing.
      </p>
    </div>
  )
}

/** The timeline, for the section about the diff. */
export function TimelinePreview() {
  const entries = [
    { label: 'Reduced 12%', detail: '£113,600 to £100,000', date: '10 Jul 2026', material: true },
    { label: '365 days unsold', detail: 'Passed a year on the market', date: '12 Mar 2026', material: true },
    { label: 'Back on the market', detail: 'Returned after coming off', date: '4 Jan 2026', material: true },
    { label: 'Asking price raised', detail: '£146,500 to £150,000', date: '21 Sep 2025', material: false },
  ]

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <p className="text-sm font-medium">Timeline</p>
      <p className="mt-1 text-sm text-muted">Every entry dated when it was observed.</p>

      <ol className="mt-4">
        {entries.map((entry) => (
          <li key={entry.label} className="relative border-l border-line py-3 pl-5">
            <span
              aria-hidden="true"
              className={`absolute -left-[4.5px] top-[1.35rem] h-2 w-2 rounded-full ${
                entry.material ? 'bg-highlight' : 'bg-line'
              }`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className={`text-sm ${entry.material ? 'font-medium' : 'text-muted'}`}>{entry.label}</p>
              <p className="text-sm text-muted">{entry.date}</p>
            </div>
            <p className="nums mt-0.5 text-sm text-muted">{entry.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The score breakdown, for the section about showing the working. */
export function ScorePreview() {
  const factors = [
    { label: 'Gross yield', detail: '8.7% on £725 a month against the asking price', points: '+22.5' },
    { label: 'Price against comparables', detail: '8.2% below the £109,000 estimate', points: '+9.8' },
    { label: 'Local demand', detail: 'Area demand rated 54 out of 100', points: '+11.3' },
    { label: 'Room to add value', detail: 'No data held', points: '0' },
  ]

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Quality</p>
        <p className="nums text-sm text-muted">43.6</p>
      </div>

      <div className="mt-3">
        {factors.map((factor) => {
          const scored = factor.points !== '0'
          return (
            <div
              key={factor.label}
              className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0"
            >
              <div className="min-w-0">
                <p className={`text-sm ${scored ? 'font-medium' : 'text-muted'}`}>{factor.label}</p>
                <p className="text-sm text-muted">{factor.detail}</p>
              </div>
              <p className={`nums shrink-0 text-sm ${scored ? 'font-medium' : 'text-muted'}`}>{factor.points}</p>
            </div>
          )
        })}
      </div>

      <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
        A factor with nothing behind it scores nothing. It never scores an assumed average.
      </p>
    </div>
  )
}
