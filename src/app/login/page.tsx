import Link from 'next/link'
import { LoginForm } from './login-form'
import { AuthShell } from '@/components/auth-shell'
import { Notice } from '@/components/ui'
import { safeRedirect } from '@/lib/auth'

const NOTICES: Record<string, { tone: 'info' | 'warn'; title: string; body: string }> = {
  link_expired: {
    tone: 'warn',
    title: 'That link did not work',
    body: 'It has expired or has already been used. Ask for a new one from the forgotten-password page.',
  },
  missing_code: {
    tone: 'warn',
    title: 'That link was incomplete',
    body: 'Ask for a new one from the forgotten-password page.',
  },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const next = safeRedirect(params.next)
  const notice = NOTICES[params.error ?? '']

  return (
    <AuthShell
      title="Sign in"
      intro="£29 a month. One area. Cancel any time."
      notice={
        notice ? (
          <Notice tone={notice.tone} title={notice.title}>
            <p>{notice.body}</p>
          </Notice>
        ) : null
      }
      footer={
        <>
          No account yet?{' '}
          <Link href="/signup" className="underline underline-offset-4 hover:text-ink">
            Create one
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  )
}
