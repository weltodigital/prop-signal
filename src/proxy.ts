import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, the Stripe webhook (which carries no
    // session and must reach the handler with its raw body untouched) and the
    // cron endpoints (which authenticate with a shared secret, not a cookie).
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
