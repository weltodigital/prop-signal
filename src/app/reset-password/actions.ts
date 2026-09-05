'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authErrorMessage, firstIssue, passwordField } from '@/lib/auth'

export type NewPasswordState = { status: 'idle' | 'error' | 'saved'; message?: string }

const schema = z
  .object({
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Those two do not match.',
    path: ['confirm'],
  })

/**
 * Sets a new password for whoever the recovery link signed in.
 *
 * The link is the authentication. By the time this runs the callback has
 * exchanged it for a session, so the check is simply whether one exists —
 * an expired or already-used link leaves none.
 *
 * Every other session is then revoked. Someone resetting a password may be
 * doing it because somebody else has it, and leaving that other session signed
 * in would make the reset pointless.
 */
export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const parsed = schema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })

  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { status: 'error', message: 'That reset link has expired or has already been used. Ask for a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    // Logged rather than shown: authErrorMessage returns one generic line
    // for anything it does not recognise, and the real text belongs here.
    console.error(JSON.stringify({ at: 'reset_password', event: 'failed', message: error.message }))
    return { status: 'error', message: authErrorMessage(error.message) }
  }

  await supabase.auth.signOut({ scope: 'others' })

  // No redirect. Somebody resetting a password is not necessarily a
  // subscriber, and /dashboard would bounce them to /subscribe with nothing
  // to show for the reset. The form says it worked and offers the way in.
  return { status: 'saved' }
}
