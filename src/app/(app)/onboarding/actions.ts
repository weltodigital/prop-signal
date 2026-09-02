'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { saveSearchProfile, searchProfileSchema } from '@/lib/search-profile'

export type OnboardingState = {
  status: 'idle' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
}

export async function saveSearch(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/onboarding')

  // Deliberately no subscription check. Somebody answers these questions
  // *before* they pay now, so that the next screen can tell them how many
  // properties their area actually holds — which is the one thing they cannot
  // find out for themselves and the one thing worth knowing before £29.
  //
  // Nothing here spends money. The saved search is a row; what spends is the
  // probe, which has its own quota, and the run, which needs a subscription.
  const subscription = await getSubscriptionState()

  const parsed = searchProfileSchema.safeParse({
    postcode: formData.get('postcode') ?? '',
    radiusMiles: formData.get('radiusMiles') ?? '',
    sourcingLists: formData.getAll('sourcingLists').map(String),
    investmentStrategies: formData.getAll('investmentStrategies').map(String),
    assumptions: { refurbCostPerSqFt: formData.get('refurbCostPerSqFt') ?? '' },
    minPrice: formData.get('minPrice') ?? '',
    maxPrice: formData.get('maxPrice') ?? '',
    minBedrooms: formData.get('minBedrooms') ?? '',
    propertyTypes: formData.getAll('propertyTypes').map(String),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form')
      fieldErrors[field] ??= issue.message
    }
    return { status: 'error', message: 'Check the highlighted answers.', fieldErrors }
  }

  const outcome = await saveSearchProfile(user.id, parsed.data)

  if (outcome.status === 'quota_exhausted') {
    return {
      status: 'error',
      message:
        outcome.kind === 'radius_widened'
          ? `You have widened your radius ${outcome.used} times this month, which is the limit of ${outcome.limit}. Widening means sourcing the new ground from scratch, which is why there is one at all. It resets with your next billing period, and the price and type filters below can still be changed as often as you like.`
          : `You have changed your area or strategy ${outcome.used} times this month, which is the limit of ${outcome.limit}. Each change means sourcing a new area from scratch. It resets with your next billing period. Widening your radius does not come out of this allowance, and the price and type filters below can still be changed as often as you like.`,
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/account')

  // Not subscribed yet: on to the count, which is the reason these questions
  // now come first. Somebody in a sparse area gets to see that before they are
  // asked for a card, and gets the radius back to widen it.
  if (!subscription.active) redirect('/onboarding?checked=1')

  redirect(outcome.status === 'created' ? '/dashboard?onboarded=1' : '/account?saved=1')
}
