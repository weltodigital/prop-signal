'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/origin'
import { authErrorMessage, emailField, firstIssue } from '@/lib/auth'

export type ResetRequestState = { status: 'idle' | 'error' | 'sent'; message?: string; email?: string }

const schema = z.object({ email: emailField })

/**
 * Sends a password reset link.
 *
 * It reports the same thing whether or not the address has an account. A form
 * that says "no account with that email" is a form that will tell anyone who
 * asks which of their guesses are customers here.
 *
 * A throttle is the exception. Silently doing nothing while someone waits for
 * an email that is not coming is worse than telling them to wait a minute.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const submitted = String(formData.get('email') ?? '')
  const parsed = schema.safeParse({ email: submitted })

  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error), email: submitted }
  }

  const { email } = parsed.data
  const origin = await requestOrigin()

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  const throttled =
    error &&
    (error.message.toLowerCase().includes('rate limit') ||
      error.message.toLowerCase().includes('for security purposes'))

  if (throttled) {
    // Logged rather than shown: authErrorMessage returns one generic line
    // for anything it does not recognise, and the real text belongs here.
    console.error(JSON.stringify({ at: 'forgot_password', event: 'failed', message: error.message }))
    return { status: 'error', message: authErrorMessage(error.message), email }
  }

  return { status: 'sent', email }
}
