import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env'

/**
 * Server Supabase client bound to the request's cookies, acting as the signed-in
 * user. Still the anon key, so RLS applies exactly as it does in the browser.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const env = clientEnv()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to swallow.
        }
      },
    },
  })
}
