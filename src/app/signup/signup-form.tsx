'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type SignUpState } from './actions'
import { Button, Field, FormError, Notice } from '@/components/ui'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(signUp, { status: 'idle' })

  // This screen is shown for a new address and for one that already has an
  // account, deliberately identically — see the note in actions.ts. So it may
  // not say "we created your account", and it has to leave somebody who has
  // simply forgotten they signed up with a way forward that does not depend on
  // us telling them which case they are in.
  if (state.status === 'confirm') {
    return (
      <Notice title="Check your email">
        <p>
          If we can set up an account for {state.email}, there is a link on its way. Click it and you will land
          back here, ready to subscribe. If it does not arrive within a minute or two, check the spam folder.
        </p>
        <p className="mt-3">
          Already had an account with this address? Nothing has changed —{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">
            sign in
          </Link>{' '}
          as usual, or{' '}
          <Link href="/forgot-password" className="underline underline-offset-4 hover:text-ink">
            reset your password
          </Link>{' '}
          if you cannot remember it.
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
        Creating an account costs nothing. You pick a plan and pay after we have shown you what your area holds.
      </p>
    </form>
  )
}
