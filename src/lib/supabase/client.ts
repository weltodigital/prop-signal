'use client'

import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env'

/** Browser Supabase client. Anon key only, every read fenced by RLS. */
export function createClient() {
  const env = clientEnv()
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
