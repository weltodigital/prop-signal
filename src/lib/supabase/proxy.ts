import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env'

/** Paths that require a signed-in user. */
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/account', '/subscribe', '/admin']

/**
 * Refreshes the Supabase session on every request and bounces anonymous
 * visitors away from the signed-in area.
 *
 * This checks *authentication* only. Whether a signed-in user has paid is
 * decided by getSubscriptionState() at the page, where a database read is
 * cheap and the answer can be explained to the user.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const env = clientEnv()

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // getUser() revalidates the token with Supabase. Do not swap it for
  // getSession(), which trusts whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && isProtected) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = ''
    login.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(login)
  }

  if (user && pathname === '/login') {
    const dashboard = request.nextUrl.clone()
    dashboard.pathname = '/dashboard'
    dashboard.search = ''
    return NextResponse.redirect(dashboard)
  }

  return response
}
