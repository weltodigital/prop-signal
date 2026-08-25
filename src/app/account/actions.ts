'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authErrorMessage, firstIssue, passwordField } from '@/lib/auth'

export type ChangePasswordState = { status: 'idle' | 'error' | 'saved'; message?: string }

const schema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Those two do not match.',
    path: ['confirm'],
  })

/**
 * Changes the password of the signed-in user.
 *
 * The current password is required even though Supabase does not ask for it.
 * Without that check, anyone who got hold of a session cookie could change the
 * password and lock the owner out of their own account — a stolen session
 * becomes a stolen account. Verifying it first costs one round trip.
 */
export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = schema.safeParse({
    current: formData.get('current'),
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

  if (!user?.email) {
    return { status: 'error', message: 'You are not signed in.' }
  }

  const { error: wrongPassword } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  })

  if (wrongPassword) {
    return { status: 'error', message: 'That is not your current password.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { status: 'error', message: authErrorMessage(error.message) }
  }

  // Same reasoning as the reset: a password change is worth nothing if the
  // session that prompted it stays signed in somewhere else.
  await supabase.auth.signOut({ scope: 'others' })

  return { status: 'saved' }
}
