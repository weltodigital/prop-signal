/**
 * What sits under the header while a page loads.
 *
 * The header itself is in the layout and does not move, so this only has to
 * stand in for the content. Shaped like a list of deals rather than a generic
 * block, so the page does not visibly change layout when the real thing lands.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-in">
      <div className="h-8 w-56 animate-pulse rounded-md bg-line" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-line/70" />

      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="rounded-xl border border-line bg-card p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-3 w-24 animate-pulse rounded bg-line/70" />
                <div className="h-5 w-2/3 animate-pulse rounded bg-line" />
                <div className="h-3 w-40 animate-pulse rounded bg-line/70" />
              </div>
              <div className="h-9 w-16 shrink-0 animate-pulse rounded-md bg-line/70" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="space-y-1.5">
                  <div className="h-2.5 w-16 animate-pulse rounded bg-line/70" />
                  <div className="h-4 w-20 animate-pulse rounded bg-line" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading</span>
    </div>
  )
}
