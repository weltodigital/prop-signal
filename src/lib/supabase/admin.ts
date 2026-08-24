import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { clientEnv, supabaseAdminEnv } from '@/lib/env'

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * The `server-only` import above makes the build fail if this module is ever
 * pulled into a client bundle. Use it in webhook handlers and the weekly
 * pipeline. Never in a page, and never behind a user-supplied id you have not
 * checked yourself — RLS is not doing it for you here.
 */
export function createAdminClient() {
  return createSupabaseClient(clientEnv().NEXT_PUBLIC_SUPABASE_URL, supabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
