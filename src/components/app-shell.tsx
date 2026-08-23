import Link from 'next/link'
import type { ReactNode } from 'react'

const NAV = [
  { href: '/dashboard', label: 'This week' },
  { href: '/account', label: 'Account' },
] as const

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/dashboard" className="text-sm font-medium tracking-wide text-accent uppercase">
            Prop Signal
          </Link>

          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm text-muted">
            <span className="hidden sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="underline underline-offset-4 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  )
}
