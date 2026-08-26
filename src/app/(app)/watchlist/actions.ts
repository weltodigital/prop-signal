'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { markNotificationsRead, toggleWatch } from '@/lib/watchlist'

/**
 * Starring, and marking notifications read.
 *
 * Server functions are reachable by a direct POST, not only through the button
 * that renders them, so each one checks the session itself. Ownership is not
 * checked here — row level security decides that at the database, which is the
 * only place it cannot be forgotten.
 */

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  return user
}

/** Refreshes everywhere a star or an unread count is shown. */
function revalidateWatchSurfaces(propertyId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/watchlist')
  revalidatePath('/archive', 'layout')
  revalidatePath(`/property/${propertyId}`)
}

export async function toggleWatchAction(formData: FormData) {
  await requireUser()

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) return

  await toggleWatch(propertyId)
  revalidateWatchSurfaces(propertyId)
}

export async function markReadAction(formData: FormData) {
  await requireUser()

  const propertyId = formData.get('propertyId')
  const scoped = typeof propertyId === 'string' && propertyId ? propertyId : undefined

  await markNotificationsRead(scoped)

  revalidatePath('/watchlist')
  revalidatePath('/dashboard')
  if (scoped) revalidatePath(`/property/${scoped}`)
}
