import { ButtonLink } from '@/components/ui'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="font-display text-h2 font-normal">Page not found</h1>
      <p className="mt-3 text-muted">That address does not exist here.</p>
      <div className="mt-8">
        <ButtonLink href="/" variant="secondary">
          Back to the start
        </ButtonLink>
      </div>
    </main>
  )
}
