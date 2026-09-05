'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authErrorMessage, firstIssue, passwordField } from '@/lib/auth'
import { chooseActiveArea } from '@/lib/areas'

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
    // Logged rather than shown: authErrorMessage returns one generic line
    // for anything it does not recognise, and the real text belongs here.
    console.error(JSON.stringify({ at: 'change_password', event: 'failed', message: error.message }))
    return { status: 'error', message: authErrorMessage(error.message) }
  }

  // Same reasoning as the reset: a password change is worth nothing if the
  // session that prompted it stays signed in somewhere else.
  await supabase.auth.signOut({ scope: 'others' })

  return { status: 'saved' }
}

/**
 * Chooses which area stays live when a downgrade has left too many.
 *
 * The webhook pauses the newest ones, because something has to be picked and
 * "keep the one you have had longest" is the least surprising rule available
 * without asking. This is the asking: a subscriber who would rather keep a
 * different one says so here, and the swap happens in the right order —
 * pausing first, then activating — because the database counts active rows and
 * would refuse the other way round.
 */
export async function chooseAreaAction(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/account')

  const profileId = String(formData.get('profileId') ?? '')
  if (!profileId) return

  // Ownership is checked inside, against rows read with the service role, so a
  // crafted post cannot activate somebody else's area.
  await chooseActiveArea(user.id, profileId)

  revalidatePath('/account')
  revalidatePath('/dashboard')
  redirect('/account?saved=1')
}
