'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authErrorMessage, emailField, firstIssue, safeRedirect } from '@/lib/auth'

export type AuthState = { status: 'idle' | 'error'; message?: string; email?: string }

const schema = z.object({
  email: emailField,
  // Not passwordField. The rules apply to a password being *set*; an existing
  // one that predates them should still get past the form and be told plainly
  // that it does not match, rather than being told it is too short.
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
})

/** Signs an existing user in. */
export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const submitted = String(formData.get('email') ?? '')

  const parsed = schema.safeParse({
    email: submitted,
    password: formData.get('password'),
    next: formData.get('next'),
  })

  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error), email: submitted }
  }

  const { email, password, next } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { status: 'error', message: authErrorMessage(error.message), email }
  }

  // Outside any try block: redirect() works by throwing.
  redirect(safeRedirect(next))
}
