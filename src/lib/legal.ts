/**
 * The legal pages, and the marker that stops them shipping empty.
 *
 * `/terms` and `/privacy` are routes with real content coming from the business
 * owner. The routes, the linking and the dates are built; the words are not, and
 * a terms page that says "sample text" in production is worse than no terms page
 * at all because it looks answered.
 *
 * So the placeholder carries a marker, and `scripts/check-legal.ts` fails the
 * build while the marker is present. It runs as `prebuild`, so `next build`
 * cannot complete and therefore Vercel cannot deploy. `tests/legal.test.ts`
 * pins the same rule for anybody running the suite instead.
 *
 * To ship: replace the `sections` arrays below with the real content and delete
 * the `PLACEHOLDER` line from each document. Nothing else needs touching.
 */

/**
 * The string the build looks for.
 *
 * Split so this file — which must mention it in order to define it — is not
 * itself a match. The checker searches the rendered documents, not the source,
 * but a marker that trips on its own definition is a marker nobody trusts.
 */
export const PLACEHOLDER_MARKER = ['UNAPPROVED', 'PLACEHOLDER', 'CONTENT'].join('_')

export type LegalSection = { heading: string; body: string[] }

export type LegalDocument = {
  title: string
  /** Shown at the top of the page, and the thing a dispute turns on. */
  lastUpdated: string
  /** Removed when the real content lands. Its presence fails the build. */
  placeholder: boolean
  intro: string
  sections: LegalSection[]
}

/**
 * The date these were last substantively changed.
 *
 * One constant per document rather than one shared, because they will not move
 * together and a privacy policy that claims to have changed when the terms did
 * is a claim somebody can check.
 */
export const TERMS: LegalDocument = {
  title: 'Terms of service',
  lastUpdated: '2026-09-04',
  placeholder: true,
  intro: `These terms govern your use of Prop Signal. They are being finalised and the text below is not yet the agreement.`,
  sections: [
    {
      heading: 'What this document will cover',
      body: [
        `The service being provided, what the subscription buys, and what it does not.`,
        `Payment, renewal, cancellation and refunds, including the immediate-start acknowledgement taken at checkout.`,
        `Acceptable use, the limits on redistributing what the product shows you, and the terms the property data is licensed to us under.`,
        `Liability, and the plain statement that this is research and analysis rather than advice.`,
      ],
    },
  ],
}

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  lastUpdated: '2026-09-04',
  placeholder: true,
  intro: `This policy explains what we do with your personal data. It is being finalised and the text below is not yet the policy.`,
  sections: [
    {
      heading: 'What this document will cover',
      body: [
        `What we collect: your email address, your saved searches, and what you did with the properties we showed you.`,
        `Who processes it on our behalf — Supabase, Stripe, Vercel and PropertyData — and where.`,
        `How long each kind of record is kept, and what is deleted when you close your account.`,
        `Your rights under the UK GDPR, and how to exercise them.`,
      ],
    },
  ],
}

export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY } as const

/** Every document that still carries the marker. Empty is the shippable state. */
export function unapprovedDocuments(): string[] {
  return Object.entries(LEGAL_DOCUMENTS)
    .filter(([, document]) => document.placeholder)
    .map(([slug]) => slug)
}
