import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui'
import logo from '@/assets/prop-signal-logo.png'
import { LegalFooter } from '@/components/legal-footer'

/**
 * The frame the four signed-out pages share — sign in, sign up, forgotten
 * password, new password. Logo, heading, one card.
 */
export function AuthShell({
  title,
  intro,
  notice,
  children,
  footer,
}: {
  title: string
  intro?: ReactNode
  notice?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="inline-block">
        <Image src={logo} alt="Prop Signal" className="h-14 w-auto" priority />
      </Link>

      <h1 className="font-display mt-5 text-h2 font-normal">{title}</h1>
      {intro ? <p className="mt-2 text-sm text-muted">{intro}</p> : null}

      {notice ? <div className="mt-6">{notice}</div> : null}

      <Card className="mt-6">{children}</Card>

      {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}

      <div className="mt-10 border-t border-line pt-6">
        <LegalFooter compact />
      </div>
    </main>
  )
}
