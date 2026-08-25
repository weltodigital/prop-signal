'use client'

import { useActionState } from 'react'
import { signUp, type SignUpState } from './actions'
import { Button, Field, FormError, Notice } from '@/components/ui'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(signUp, { status: 'idle' })

  if (state.status === 'confirm') {
    return (
      <Notice title="Confirm your email address">
        <p>
          We sent a link to {state.email}. Click it and you will land back here, ready to subscribe. If it does not
          arrive within a minute or two, check the spam folder.
        </p>
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <Field
        id="email"
        name="email"
        type="email"
        label="Email address"
        autoComplete="email"
        required
        defaultValue={state.email}
        placeholder="you@example.com"
      />

      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <FormError message={state.status === 'error' ? state.message : undefined} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating your account…' : 'Create account'}
      </Button>

      <p className="text-sm text-muted">
        Creating an account costs nothing. The £29 is charged at the next step, by Stripe.
      </p>
    </form>
  )
}
