import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

/**
 * The signed-in frame.
 *
 * The header used to live inside each page, which meant every navigation
 * unmounted it and the whole chrome vanished behind a skeleton before the next
 * page arrived. Here it renders once and stays put: only the content below it
 * suspends, so moving between pages feels like moving within an app rather than
 * reloading a website.
 *
 * Only authentication is checked here. Whether somebody has paid is decided by
 * each page, because /subscribe and /onboarding sit inside this frame and are
 * exactly where an unpaid subscriber is supposed to be.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login')

  return <AppShell email={user.email}>{children}</AppShell>
}
