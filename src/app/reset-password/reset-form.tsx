'use client'

import { useActionState } from 'react'
import { setNewPassword, type NewPasswordState } from './actions'
import { Button, ButtonLink, Field, FormError, Notice } from '@/components/ui'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, { status: 'idle' })

  if (state.status === 'saved') {
    return (
      <div className="space-y-4">
        <Notice title="Password set">
          <p>Anywhere else you were signed in has been signed out.</p>
        </Notice>
        <ButtonLink href="/dashboard" className="w-full">
          Go to your dashboard
        </ButtonLink>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field
        id="password"
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

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Set password'}
      </Button>

      <p className="text-sm text-muted">
        Setting a new password signs out anywhere else you are signed in.
      </p>
    </form>
  )
}
