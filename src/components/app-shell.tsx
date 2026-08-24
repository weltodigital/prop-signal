import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import mark from '@/assets/prop-signal-mark.png'
import { countUnread } from '@/lib/watchlist'

const NAV = [
  { href: '/dashboard', label: 'This week' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/archive', label: 'Archive' },
  { href: '/account', label: 'Account' },
] as const

export async function AppShell({ email, children }: { email: string; children: ReactNode }) {
  // Events on watched properties that the user has not read. Derived from the
  // diff the run already wrote, so counting them costs nothing.
  const unread = await countUnread()

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          {/* The mark, with the name in text beside it. The full lockup is
              stacked, and at header height its wordmark would be unreadable. */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src={mark} alt="" aria-hidden="true" className="h-7 w-auto" priority />
            <span className="text-sm font-medium tracking-wide uppercase">Prop Signal</span>
          </Link>

          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted hover:text-ink">
                {item.label}
                {item.href === '/watchlist' && unread > 0 ? (
                  <span
                    className="nums ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs text-white"
                    aria-label={`${unread} unread ${unread === 1 ? 'event' : 'events'}`}
                  >
                    {unread}
                  </span>
                ) : null}
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
