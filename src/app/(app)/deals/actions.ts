'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { recordStage, untrack } from '@/lib/deal-progress'
import { isDealStage, STAGE_DEFINITIONS } from '@/lib/deal-stages'

/**
 * Recording what the subscriber did next.
 *
 * Server functions are reachable by a direct POST, not only through the control
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

/** Refreshes everywhere a stage is shown. */
function revalidateDealSurfaces(propertyId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/deals')
  revalidatePath('/archive', 'layout')
  revalidatePath(`/property/${propertyId}`)
}

export async function setStageAction(formData: FormData) {
  await requireUser()

  const propertyId = String(formData.get('propertyId') ?? '')
  const stage = String(formData.get('stage') ?? '')

  // A stage that is not one of the nine is a crafted post, not a mistake.
  if (!propertyId || !isDealStage(stage)) return

  // "No longer listed" is an observation the run makes, not a claim the
  // subscriber gets to enter. Somebody who wants a deal closed has Passed and
  // Fell through, which say what actually happened.
  if (STAGE_DEFINITIONS[stage].systemOnly) return

  await recordStage(propertyId, stage)
  revalidateDealSurfaces(propertyId)
}

export async function untrackAction(formData: FormData) {
  await requireUser()

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) return

  await untrack(propertyId)
  revalidateDealSurfaces(propertyId)
}
