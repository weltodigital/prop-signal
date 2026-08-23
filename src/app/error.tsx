'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Something broke</h1>
      <p className="mt-3 text-muted">
        That is on us, not on you. Nothing you did caused it and no billing action was taken.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-sm text-muted">Reference {error.digest}</p> : null}
      <div className="mt-8">
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  )
}
