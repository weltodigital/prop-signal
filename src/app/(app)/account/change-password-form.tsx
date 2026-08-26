'use client'

import { useActionState } from 'react'
import { changePassword, type ChangePasswordState } from './actions'
import { Button, Field, FormError, Notice } from '@/components/ui'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePassword, {
    status: 'idle',
  })

  if (state.status === 'saved') {
    return (
      <Notice title="Password changed">
        <p>Anywhere else you were signed in has been signed out.</p>
      </Notice>
    )
  }

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Field
        id="current"
        name="current"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
      />

      <Field
        id="new-password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <Field
        id="confirm"
        name="confirm"
        type="password"
        label="New password again"
        autoComplete="new-password"
        required
      />

      <FormError message={state.status === 'error' ? state.message : undefined} />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  )
}
