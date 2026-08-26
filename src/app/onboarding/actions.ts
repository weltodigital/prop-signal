'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { saveSearchProfile, searchProfileSchema, SEARCH_CHANGE_LIMIT } from '@/lib/search-profile'

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

  // The search decides what the pipeline spends. It is only set up for people
  // who are paying, checked here rather than trusted from the page that led here.
  const subscription = await getSubscriptionState()
  if (!subscription.active) redirect('/subscribe')

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
      message: `You have changed your area or strategy ${outcome.used} times this month, which is the limit of ${SEARCH_CHANGE_LIMIT}. Each change means sourcing a new area from scratch. It resets with your next billing period, and the price and type filters below can still be changed as often as you like.`,
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/account')
  redirect(outcome.status === 'created' ? '/dashboard?onboarded=1' : '/account?saved=1')
}
