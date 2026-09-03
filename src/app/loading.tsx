/**
 * The signed-out fallback.
 *
 * Pages outside the app frame carry their own chrome, so this stands in for a
 * whole page rather than for content under a header.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16" role="status" aria-live="polite">
      <div className="shimmer h-8 w-56" />
      <div className="shimmer mt-4 h-4 w-full max-w-md" />
      <div className="shimmer mt-8 h-40 w-full rounded-lg" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
