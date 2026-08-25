import Link from 'next/link'
import { ForgotPasswordForm } from './forgot-form'
import { AuthShell } from '@/components/auth-shell'

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgotten password"
      intro="Tell us the address you signed up with and we will send a link to set a new one."
      footer={
        <Link href="/login" className="underline underline-offset-4 hover:text-ink">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
