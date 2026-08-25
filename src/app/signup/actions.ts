'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/origin'
import { authErrorMessage, emailField, firstIssue, passwordField, safeRedirect } from '@/lib/auth'

export type SignUpState = { status: 'idle' | 'error' | 'confirm'; message?: string; email?: string }

/** Where a new account goes. They have not paid yet, so: to the till. */
const AFTER_SIGNUP = '/subscribe'

const schema = z.object({
  email: emailField,
  password: passwordField,
  next: z.string().optional(),
})

/**
 * Creates an account and, where the project allows it, signs them straight in.
 *
 * Supabase decides whether a new user is confirmed on creation — the
 * "Confirm email" setting, `mailer_autoconfirm` on /auth/v1/settings. This
 * handles both answers rather than assuming one, because the setting lives in
 * a dashboard rather than in this repository and can be changed without a
 * deploy. A session back means they are in. No session means Supabase has sent
 * a confirmation link and is waiting for it.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
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
  const destination = safeRedirect(next, AFTER_SIGNUP)
  const origin = await requestOrigin()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
    },
  })

  if (error) {
    return { status: 'error', message: authErrorMessage(error.message), email }
  }

  // With confirmations on, Supabase will not say an address is taken — that
  // would let anyone test emails against the user table. It returns a user with
  // no identities instead. Treat it as the sign-in prompt it is.
  if (data.user && data.user.identities?.length === 0) {
    return {
      status: 'error',
      message: 'That email address already has an account. Sign in instead.',
      email,
    }
  }

  if (!data.session) {
    return { status: 'confirm', email }
  }

  redirect(destination)
}
