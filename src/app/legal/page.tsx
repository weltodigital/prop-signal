import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingFooter } from '@/components/marketing/footer'
import { COMPANY } from '@/lib/company'
import { LEGAL_DOCUMENTS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Company details — Prop Signal',
  description: `Trading disclosures for ${COMPANY.legalName}, the company behind Prop Signal.`,
}

/**
 * The trading disclosures in full.
 *
 * The footer carries them on every page, which is what the regulations require.
 * This is the page a footer link points at, so somebody looking for the company
 * behind the product — a customer, a regulator, a bank — finds it stated once,
 * properly, rather than assembled from a line of small print.
 */
export default function LegalPage() {
  const rows: Array<[string, string]> = [
    ['Registered company name', COMPANY.legalName],
    ['Trading as', COMPANY.tradingName],
    ['Company registration number', COMPANY.companyNumber],
    ['Registered in', COMPANY.jurisdiction],
    ['Registered office address', COMPANY.registeredOffice],
  ]

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-h2 font-normal">Company details</h1>
        <p className="mt-2 max-w-prose text-muted">
          Prop Signal is a trading name of {COMPANY.legalName}. These are the trading disclosures required by the
          Companies Act 2006 and the Electronic Commerce (EC Directive) Regulations 2002.
        </p>

        <dl className="mt-10 divide-y divide-line border-y border-line">
          {rows.map(([term, value]) => (
            <div key={term} className="flex flex-wrap gap-x-6 gap-y-1 py-3">
              <dt className="w-full text-sm text-muted sm:w-64">{term}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-6 gap-y-1 py-3">
            <dt className="w-full text-sm text-muted sm:w-64">Contact</dt>
            <dd className="text-sm">
              <a
                href={`mailto:${COMPANY.contactEmail}`}
                className="underline underline-offset-4 hover:text-accent"
              >
                {COMPANY.contactEmail}
              </a>
            </dd>
          </div>
        </dl>

        <p className="mt-8 max-w-prose text-sm text-muted">
          {COMPANY.legalName} is not authorised or regulated by the Financial Conduct Authority. Prop Signal is a
          research and analysis tool: it reports what is publicly listed in an area and shows the arithmetic behind
          its scores. It does not give financial, investment, tax or legal advice, does not act for you in a
          transaction, and is never paid by a seller or an agent.
        </p>

        <h2 className="mt-12 text-base font-medium">Policies</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link href="/terms" className="underline underline-offset-4 hover:text-accent">
              {LEGAL_DOCUMENTS.terms.title}
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="underline underline-offset-4 hover:text-accent">
              {LEGAL_DOCUMENTS.privacy.title}
            </Link>
          </li>
        </ul>
      </main>

      <MarketingFooter />
    </>
  )
}
