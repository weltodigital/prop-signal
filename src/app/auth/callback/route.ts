import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link landing point. Supabase sends the user here with a one-time code;
 * we exchange it for a session cookie and send them on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  // Only relative paths, so a crafted link cannot bounce someone off-site.
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

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
