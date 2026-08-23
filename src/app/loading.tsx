export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16" role="status" aria-live="polite">
      <div className="h-7 w-48 animate-pulse rounded bg-line" />
      <div className="mt-4 h-4 w-full max-w-md animate-pulse rounded bg-line" />
      <div className="mt-8 h-40 w-full animate-pulse rounded-lg bg-line" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
