import { redirect } from 'next/navigation'
import { ResetPasswordForm } from './reset-form'
import { AuthShell } from '@/components/auth-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Reached from a reset link, which the callback has already exchanged for a
 * session. No session means the link expired, was used, or was never followed.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?error=link_expired')

  return (
    <AuthShell title="Set a new password" intro={`For ${user.email}.`}>
      <ResetPasswordForm />
    </AuthShell>
  )
}
