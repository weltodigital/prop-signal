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

/**
 * A bubble, floating clear of the top edge.
 *
 * Fixed rather than sticky, which is the whole point of the shape: a bar in the
 * flow would push the hero down and leave a strip of bare ground above the
 * wash, and the bubble would spend the first screenful sitting on nothing.
 * Fixed, the wash runs to the very top of the page and the bubble rides on it
 * from the first pixel.
 *
 * Everything it costs is paid for elsewhere. The hero's content carries the top
 * padding the header no longer occupies, and `scroll-padding-top` on `html`
 * keeps an anchored section from landing underneath it.
 *
 * Translucent and blurred, so what is behind it stays legible as it passes —
 * on a page whose top third is a deep wash, an opaque bar would read as a
 * second page laid over the first.
 */
export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="flex items-center gap-4 rounded-full border border-white/70 bg-ground/75 py-2 pr-2 pl-4 shadow-[0_10px_30px_-14px_rgba(13,27,47,0.45)] backdrop-blur-md sm:gap-8 sm:pl-5">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image src={mark} alt="" aria-hidden="true" className="h-7 w-auto" priority />
            <span className="text-base font-semibold tracking-tight text-accent">Prop Signal</span>
          </Link>

          {/* Each link is its own small bubble on hover, so the shape of the
              bar is repeated at the scale of the thing you are pointing at
              rather than being a property of the container alone. */}
          <nav className="hidden gap-1 text-sm text-muted lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-1.5 transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 text-sm">
            {signedIn ? (
              <ButtonLink href="/dashboard" className="rounded-full!">
                Go to your dashboard
              </ButtonLink>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink md:inline"
                >
                  Sign in
                </Link>
                <ButtonLink href="/signup" className="rounded-full!">
                  Start from £29 a month
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
