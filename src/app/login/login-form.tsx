'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signIn, type AuthState } from './actions'
import { Button, Field, FormError } from '@/components/ui'

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, { status: 'idle' })

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
        autoComplete="current-password"
        required
      />

      <FormError message={state.status === 'error' ? state.message : undefined} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted underline underline-offset-4 hover:text-ink">
          Forgotten your password?
        </Link>
      </p>
    </form>
  )
}
