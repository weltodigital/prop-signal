'use client'

import { useActionState } from 'react'
import { requestPasswordReset, type ResetRequestState } from './actions'
import { Button, Field, FormError, Notice } from '@/components/ui'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {
    status: 'idle',
  })

  if (state.status === 'sent') {
    return (
      <Notice title="Check your inbox">
        <p>
          If {state.email} has an account here, a link to set a new password is on its way. It is good for one use.
        </p>
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
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

      <FormError message={state.status === 'error' ? state.message : undefined} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Email me a reset link'}
      </Button>
    </form>
  )
}
