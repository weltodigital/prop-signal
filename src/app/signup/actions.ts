'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/origin'
import { authErrorMessage, emailField, firstIssue, meansAlreadyRegistered, passwordField, safeRedirect } from '@/lib/auth'

export type SignUpState = { status: 'idle' | 'error' | 'confirm'; message?: string; email?: string }

/**
 * Where a new account goes.
 *
 * The questions, not the till. Answering them costs nothing and ends on the one
 * screen that tells somebody how many properties their area actually holds —
 * which is worth knowing before £29 rather than after it. The till is one
 * button from there.
 */
const AFTER_SIGNUP = '/onboarding'

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

  // An address that already has an account must produce exactly the same
  // response as one that does not. Otherwise /signup is a membership oracle:
  // an anonymous visitor posts an address and reads whether we know it. The
  // sign-in form has always been careful about this; the sign-up form used to
  // give it away in one line, which made the care on the other form pointless.
  //
  // Supabase reports it two ways depending on how the project is configured —
  // an explicit "user already registered" error, or a user with no identities —
  // and both are handled the same way here: say nothing, and answer as though
  // the sign-up worked.
  //
  // What the real owner of the address gets is Supabase's own email, which is
  // the right channel for the news. What the person at the keyboard gets is a
  // screen that reads identically either way, and which points at sign-in and
  // password reset so somebody who has simply forgotten is not stuck.
  const alreadyRegistered =
    (error !== null && meansAlreadyRegistered(error.message)) ||
    (data.user !== null && data.user.identities?.length === 0)

  if (alreadyRegistered) {
    // Logged, because it is worth knowing how often it happens, and because
    // this is the one place the fact is allowed to exist.
    console.info(JSON.stringify({ at: 'signup', event: 'existing_address' }))
    return { status: 'confirm', email }
  }

  if (error) {
    // The raw text goes to the log, not to the visitor. Supabase's error
    // strings are written for developers and change without notice.
    console.error(JSON.stringify({ at: 'signup', event: 'failed', message: error.message }))
    return { status: 'error', message: authErrorMessage(error.message), email }
  }

  // Deliberately the same branch as an existing address above. A project with
  // email confirmation switched off would return a session here and redirect,
  // which would make the two cases distinguishable again — so confirmation
  // must stay on for this to hold, and this comment is the reminder.
  if (!data.session) {
    return { status: 'confirm', email }
  }

  redirect(destination)
}
