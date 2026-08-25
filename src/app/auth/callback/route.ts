import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedirect } from '@/lib/auth'

/**
 * Where every emailed link lands: email confirmation on a new account, and the
 * password reset. Supabase sends a one-time code; we exchange it for a session
 * cookie and send them on.
 *
 * A recovery link goes to /reset-password whatever the link says, because the
 * session it just created is a recovery session and setting a password is the
 * only thing it is for.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  const destination = type === 'recovery' ? '/reset-password' : safeRedirect(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`)
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
