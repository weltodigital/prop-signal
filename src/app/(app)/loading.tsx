import { LoadingBar, Rise } from '@/components/motion-ui'

/**
 * What sits under the header while a page loads.
 *
 * The header is in the layout and does not move, so this only stands in for the
 * content. Shaped like the list it is replacing, down to the line count, so
 * nothing jumps when the real thing arrives — a skeleton that changes the
 * layout on landing is worse than no skeleton at all.
 *
 * The bar at the top says work is happening and refuses to say how much is
 * left, because we do not know and a percentage that guesses is a lie.
 */
function Row() {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
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
      <div className="-mt-12 mb-10">
        <LoadingBar />
      </div>

      <div className="shimmer h-8 w-52" />
      <div className="shimmer mt-3 h-3.5 w-80 max-w-full" />

      <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="border-t border-line pt-4">
            <div className="shimmer h-2.5 w-20" />
            <div className="shimmer mt-2.5 h-7 w-16" />
            <div className="shimmer mt-3 h-[3px] w-full" />
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {[0, 1, 2, 3].map((row) => (
          <Rise key={row} delay={row * 0.06}>
            <Row />
          </Rise>
        ))}
      </div>

      <span className="sr-only">Loading</span>
    </div>
  )
}
