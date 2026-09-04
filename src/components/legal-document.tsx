import { MarketingFooter } from '@/components/marketing/footer'
import { PLACEHOLDER_MARKER, type LegalDocument } from '@/lib/legal'

/**
 * One legal document, rendered.
 *
 * Server-rendered and static: these are the two pages most likely to be read by
 * somebody who is not signed in, including a regulator, and they should not
 * depend on a session or a database being up.
 *
 * The placeholder banner is deliberately loud and deliberately at the top. The
 * build will not complete while `placeholder` is true, so nobody should ever see
 * this in production — but if a check is ever removed, the failure mode should
 * be a page that admits what it is rather than one that quietly looks finished.
 */
export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-h2 font-normal">{document.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Last updated{' '}
          <time dateTime={document.lastUpdated} className="figure">
            {new Date(`${document.lastUpdated}T00:00:00Z`).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
        </p>

        {document.placeholder ? (
          <div className="mt-8 border-l-2 border-warn bg-warn-soft px-4 py-3" role="alert">
            <p className="text-sm font-medium">{PLACEHOLDER_MARKER}</p>
            <p className="mt-1 text-sm">
              This is a draft. The wording below has been written but not approved, has not been reviewed by a
              solicitor, and must not be relied on. The build is configured to fail while this notice is present,
              so it should never be reachable in production.
            </p>
          </div>
        ) : null}

        <p className="mt-8 max-w-prose">{document.intro}</p>

        {document.sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-base font-medium">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-prose text-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>

      <MarketingFooter />
    </>
  )
}
