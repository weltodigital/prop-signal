import Link from 'next/link'
import { SignUpForm } from './signup-form'
import { AuthShell } from '@/components/auth-shell'
import { safeRedirect } from '@/lib/auth'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = safeRedirect(params.next, '/subscribe')

  return (
    <AuthShell
      title="Create an account"
      intro="From £29 a month. The investment properties in your area that stack against the way you invest, in front of you every Monday. Cancel any time."
      footer={
        <>
          Already have one?{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  )
}
