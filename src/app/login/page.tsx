import Image from 'next/image'
import Link from 'next/link'
import { LoginForm } from './login-form'
import { Card, Notice } from '@/components/ui'
import logo from '@/assets/prop-signal-logo.png'

const LINK_ERRORS: Record<string, string> = {
  link_expired: 'That sign-in link has expired or has already been used. Ask for a new one below.',
  missing_code: 'That link was incomplete. Ask for a new one below.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const next = params.next && params.next.startsWith('/') ? params.next : '/dashboard'
  const linkError = params.error ? LINK_ERRORS[params.error] : undefined

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="inline-block">
        <Image src={logo} alt="Prop Signal" className="h-14 w-auto" priority />
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">£29 a month. One area. Cancel any time.</p>

      {linkError ? (
        <div className="mt-6">
          <Notice tone="warn" title="That link did not work">
            <p>{linkError}</p>
          </Notice>
        </div>
      ) : null}

      <Card className="mt-6">
        <LoginForm next={next} />
      </Card>
    </main>
  )
}
