import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import mark from '@/assets/prop-signal-mark.png'
import { hasUnseenWeek } from '@/lib/deals'
import { countUnread } from '@/lib/watchlist'

const NAV = [
  { href: '/dashboard', label: 'This week' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/deals', label: 'Your deals' },
  { href: '/archive', label: 'Archive' },
  { href: '/account', label: 'Account' },
] as const

export async function AppShell({ email, children }: { email: string; children: ReactNode }) {
  // Both derived from rows the run already wrote, so the markers cost nothing.
  const [unread, unseenWeek] = await Promise.all([countUnread(), hasUnseenWeek()])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          {/* The mark, with the name in text beside it. The full lockup is
              stacked, and at header height its wordmark would be unreadable. */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src={mark} alt="" aria-hidden="true" className="h-7 w-auto" priority />
            <span className="text-sm font-medium tracking-wide uppercase">Prop Signal</span>
          </Link>

          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative rounded px-1 py-0.5 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {item.label}
                {item.href === '/dashboard' && unseenWeek ? (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle"
                    aria-label="A new list you have not looked at"
                  />
                ) : null}
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
              <button type="submit" className="underline underline-offset-4 transition-colors hover:text-ink">
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
