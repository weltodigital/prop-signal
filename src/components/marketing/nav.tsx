import Image from 'next/image'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui'
import mark from '@/assets/prop-signal-mark.png'

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#inside', label: "What's inside" },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const

/** Sticky, translucent, thin. The bar is not the product. */
export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-ground/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src={mark} alt="" aria-hidden="true" className="h-7 w-auto" priority />
          <span className="text-base font-semibold tracking-tight text-accent">Prop Signal</span>
        </Link>

        <nav className="hidden gap-7 text-sm text-muted lg:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {signedIn ? (
            <ButtonLink href="/dashboard" variant="signal">
              Go to your dashboard
            </ButtonLink>
          ) : (
            <>
              <Link href="/login" className="hidden text-muted hover:text-ink md:inline">
                Sign in
              </Link>
              <ButtonLink href="/signup" variant="signal">
                Start for £29 a month
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
