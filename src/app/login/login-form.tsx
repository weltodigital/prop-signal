'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendMagicLink, type LoginState } from './actions'
import { Button, Notice } from '@/components/ui'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Sending…' : 'Email me a sign-in link'}
    </Button>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' })

  if (state.status === 'sent') {
    return (
      <Notice title="Check your inbox">
        <p>
          We sent a sign-in link to {state.email}. It is good for one use. If it does not arrive within a minute or
          two, check the spam folder.
        </p>
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="you@example.com"
        />
      </div>

      {state.status === 'error' && state.message ? (
        <p className="text-sm text-warn" role="alert">
          {state.message}
        </p>
      ) : null}

      <Submit />

      <p className="text-sm text-muted">
        No password. We send a link that signs you in. The same link works whether you already subscribe or are
        signing up for the first time.
      </p>
    </form>
  )
}
