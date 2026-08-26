import Image from 'next/image'
import Link from 'next/link'
import mark from '@/assets/prop-signal-mark.png'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '#how', label: 'How it works' },
      { href: '#inside', label: "What's inside" },
      { href: '#pricing', label: 'Pricing' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/signup', label: 'Create an account' },
    ],
  },
] as const

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap justify-between gap-x-12 gap-y-10">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Image src={mark} alt="" aria-hidden="true" className="h-7 w-auto" />
              <span className="text-base font-semibold tracking-tight text-accent">Prop Signal</span>
            </div>
            <p className="mt-3 text-sm text-muted">
              UK investment property, brought to you. Five a week, chosen because a seller moved, with the numbers
              already worked out.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-medium">{column.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link href={link.href} className="hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-line pt-6 text-sm text-muted">
          <p>
            Every figure carries the date it was observed. Listings link to the original agent advert, and we never
            reproduce a listing photograph.
          </p>
        </div>
      </div>
    </footer>
  )
}
