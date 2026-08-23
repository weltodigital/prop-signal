import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { getOrCreateCustomer } from '@/lib/stripe/customer'
import { siteUrl } from '@/lib/env'

export const runtime = 'nodejs'

/** Sends the user to the Stripe customer portal to change card or cancel. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.redirect(new URL('/login?next=/account', request.nextUrl.origin), { status: 303 })
  }

  const customerId = await getOrCreateCustomer(user.id, user.email)

  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: siteUrl('/account'),
  })

  return NextResponse.redirect(session.url, { status: 303 })
}
