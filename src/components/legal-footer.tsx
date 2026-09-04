import Link from 'next/link'
import { COMPANY, tradingDisclosure } from '@/lib/company'

/**
 * The trading disclosures, on every page.
 *
 * Company name, registered number, registered office and a contact address are
 * required on a business website by the Companies Act 2006 trading disclosure
 * regulations and by the E-Commerce Regulations 2002. "On the website" means
 * every page, not one page somebody can find if they look, which is why this is
 * a component rather than a section of `/legal`.
 *
 * It renders in three places: under the marketing footer, under the signed-in
 * app, and under the signed-out auth pages. Those are the three frames the site
 * has — there is no fourth, and a new one is the thing to watch for.
 *
 * `compact` is for the frames that are a narrow column rather than a full-width
 * footer. Same content, less furniture.
 */
export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'text-xs text-muted' : 'text-sm text-muted'}>
      <p>{tradingDisclosure()}</p>
      <p className="mt-2">
        Contact:{' '}
        <a href={`mailto:${COMPANY.contactEmail}`} className="underline underline-offset-4 hover:text-ink">
          {COMPANY.contactEmail}
        </a>
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/legal" className="underline underline-offset-4 hover:text-ink">
          Company details
        </Link>
        <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms of service
        </Link>
        <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
          Privacy policy
        </Link>
      </p>
      <p className="mt-2">
        © {new Date().getFullYear()} {COMPANY.legalName}. Prop Signal is a research and analysis tool. It does
        not give financial, investment, tax or legal advice, and nothing on it is a recommendation to buy.
      </p>
    </div>
  )
}
