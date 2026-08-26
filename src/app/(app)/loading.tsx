/**
 * What sits under the header while a page loads.
 *
 * The header is in the layout and does not move, so this only stands in for the
 * content. Shaped like the list it is replacing, down to the line count, so
 * nothing jumps when the real thing arrives — a skeleton that changes the
 * layout on landing is worse than no skeleton at all.
 */
function Row() {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="shimmer h-3 w-28" />
          <div className="shimmer h-4 w-2/3" />
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="shimmer h-9 w-11" />
          <div className="shimmer h-9 w-24" />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <div className="shimmer h-3.5 w-24" />
        <div className="shimmer h-3.5 w-28" />
        <div className="shimmer h-3.5 w-20" />
        <div className="shimmer h-3.5 w-24" />
      </div>

      <div className="mt-3 border-t border-line pt-2.5">
        <div className="shimmer h-3.5 w-40" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <div className="shimmer h-8 w-52" />
      <div className="shimmer mt-3 h-3.5 w-80 max-w-full" />

      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <Row key={row} />
        ))}
      </div>

      <span className="sr-only">Loading</span>
    </div>
  )
}
