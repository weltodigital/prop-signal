'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { markNotificationsRead } from '@/lib/watchlist'

/**
 * Marking changes read.
 *
 * Server functions are reachable by a direct POST, not only through the button
 * that renders them, so this checks the session itself. Which rows it may touch
 * is decided by row level security at the database.
 */
export async function markReadAction(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const propertyId = formData.get('propertyId')
  const scoped = typeof propertyId === 'string' && propertyId ? propertyId : undefined

  await markNotificationsRead(scoped)

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  if (scoped) revalidatePath(`/property/${scoped}`)
}
