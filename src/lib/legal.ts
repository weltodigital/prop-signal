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
/**
 * Facts in the drafts below that the code cannot confirm.
 *
 * Everything else was written from what this repository actually does — the
 * sub-processors are the four the code talks to, the cache retention is read
 * off `ENDPOINTS`, and the cancellation position is the one implemented in
 * `consumer-rights.ts`. These four are not knowable from here and must be
 * checked by a person before `placeholder` goes false:
 *
 *   1. CONFIRM_REGION in the Supabase entry — which region the Supabase project
 *      is actually hosted in. Find it in the Supabase dashboard under Project
 *      Settings. A privacy policy naming the wrong country is a real defect,
 *      so it is left as a marker rather than guessed.
 *   2. support@usepropsignal.com — that the address exists and is monitored. It
 *      appears in the statutory disclosures on every page.
 *   3. The two-working-day response target in the terms.
 *   4. That account deletion on request is a process somebody will actually
 *      run, since there is no self-serve deletion in the product yet.
 *
 * And the whole of both documents should be read by a solicitor. They are
 * drafted to be accurate about this system, which is the part a solicitor
 * cannot do for you; whether they are sufficient is the part you cannot do
 * for yourself.
 */
export const TERMS: LegalDocument = {
  title: 'Terms of service',
  lastUpdated: '2026-09-04',
  placeholder: true,
  intro: `These terms are the agreement between you and Welto Limited for your use of Prop Signal. By subscribing you accept them. Please read the section on what Prop Signal is and is not, because it is the part people most often assume.`,
  sections: [
    {
      heading: 'Who you are contracting with',
      body: [
        `Prop Signal is a trading name of Welto Limited, a company registered in England and Wales under number 14630258, with its registered office at 167-169 Great Portland Street, London, England, W1W 5PF. In these terms "we", "us" and "our" mean Welto Limited, and "you" means the person who holds the account.`,
        `You can reach us at support@usepropsignal.com. We aim to answer within two working days.`,
      ],
    },
    {
      heading: 'What Prop Signal is, and what it is not',
      body: [
        `Prop Signal is a research and analysis tool. Each week it examines properties publicly advertised for sale in the area you choose, applies the criteria you set, scores what it finds against the investment strategies you tell us you run, and publishes the workings behind every score.`,
        `It is not advice. Nothing on Prop Signal is financial advice, investment advice, tax advice, legal advice, a personal recommendation, or a valuation. We do not know your circumstances, your borrowing, your tax position or your risk appetite, and nothing we publish takes them into account. Every decision to buy, to bid, or to walk away is yours alone, and you should take your own professional advice before making one.`,
        `We are not a deal sourcer, a property agent or a broker. We do not introduce properties to buyers, do not act for you or for any seller in a transaction, and are never paid a fee, a commission or an introduction fee by anyone on a completed purchase. Your subscription is the whole of what we earn, whether you buy nothing or buy several. Welto Limited is not authorised or regulated by the Financial Conduct Authority.`,
        `Scores, estimated rents, estimated values, yields and refurbishment figures are estimates produced from third-party data and stated assumptions. They will sometimes be wrong. Every figure carries the date it was observed and the arithmetic behind it, so that you can check it rather than trust it.`,
      ],
    },
    {
      heading: 'Your account',
      body: [
        `You must be at least 18 and provide an email address you control. You are responsible for keeping your password secret and for everything done through your account. Tell us promptly at support@usepropsignal.com if you think someone else has access to it.`,
        `One account is for one person or one business. You may not share your login, and you may not resell, republish or redistribute what Prop Signal shows you. That restriction is not commercial protectiveness: our property data is licensed to us on terms that do not permit us to pass it on for republication.`,
      ],
    },
    {
      heading: 'Subscription, payment and renewal',
      body: [
        `Subscriptions are monthly and are billed in advance. The price and what each plan includes are shown at checkout before you pay. Payment is taken by Stripe; we never see or store your card details.`,
        `Your subscription renews automatically each month until you cancel it. We will tell you before any price change, and you may cancel before it takes effect.`,
        `If a payment fails, access pauses while Stripe retries it. We do not wait for the retries to be exhausted, because an active subscription costs us money every week. Your saved searches and your history are kept, and access resumes when payment succeeds.`,
      ],
    },
    {
      heading: 'Cancelling, and your 14-day right',
      body: [
        `You can cancel at any time from your account page. Cancellation stops the next payment and your access continues to the end of the period you have already paid for. We do not pro-rate part months.`,
        `Separately from that, the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 give consumers 14 days to cancel a purchase made at a distance and receive a refund. Because your first list is built within minutes of payment, we ask you at checkout to confirm that you want the service to start straight away and that you understand you lose that 14-day right once it has. We record the exact wording you were shown and the time you confirmed it. If you have not ticked that box, we cannot take your payment.`,
        `If you subscribe as a business rather than as a consumer, the 14-day right does not apply to you in any event.`,
        `None of this affects your legal rights if the service is not provided with reasonable care and skill.`,
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        `Do not attempt to scrape, bulk-download, reverse engineer or resell the service or the data in it. Do not use automated means to access it beyond ordinary use of the website. Do not use Prop Signal to break the law.`,
        `We may suspend or close an account that does these things, or that is used to abuse the free area check. Where we close an account for breach we will tell you why, and we will refund any part of a period you have paid for and not received unless the breach was deliberate.`,
      ],
    },
    {
      heading: 'Availability',
      body: [
        `We aim to publish a list each week, and we depend on a third-party data provider to do it. We do not promise a particular number of properties: how many clear the bar is decided by your area, your radius and your filters, and a quiet market at a tight radius may produce very few. We say so before you pay, and the area check is there so you can see what your area holds first.`,
        `We do not promise uninterrupted availability. We may change or withdraw features, and we will give reasonable notice of anything that materially reduces what you are paying for.`,
      ],
    },
    {
      heading: 'Liability',
      body: [
        `Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be limited.`,
        `Subject to that, we are not liable for any loss arising from a decision you make about a property. That includes the price you pay, the rent you achieve, the cost of works, a purchase that falls through, or a property that turns out to be unsuitable. Prop Signal reports and analyses publicly available information; it does not inspect properties, verify listings, or stand behind a seller's claims.`,
        `Subject to the first paragraph of this section, our total liability to you in any twelve-month period is limited to the amount you paid us in that period. We are not liable for loss of profit, loss of opportunity, or indirect or consequential loss.`,
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        `We may change these terms. If a change materially affects your rights we will tell you by email at least 30 days before it takes effect, and you may cancel before then if you do not accept it. The date at the top of this page is the date of the current version.`,
      ],
    },
    {
      heading: 'Complaints and governing law',
      body: [
        `If something has gone wrong, write to support@usepropsignal.com and we will answer. We would always rather fix it than argue about it.`,
        `These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction. If you live in Scotland or Northern Ireland you may also bring proceedings in your local courts.`,
      ],
    },
  ],
}

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  lastUpdated: '2026-09-04',
  placeholder: true,
  intro: `This policy explains what personal data Prop Signal collects, why, who else sees it, and what you can do about it. Welto Limited is the data controller. There is no advertising, no tracking and no analytics on this site, and we do not sell or share your data with anyone for their own purposes.`,
  sections: [
    {
      heading: 'Who is responsible for your data',
      body: [
        `Welto Limited, a company registered in England and Wales under number 14630258, registered office 167-169 Great Portland Street, London, England, W1W 5PF, is the controller of the personal data described here.`,
        `For any privacy question, or to exercise any of the rights below, write to support@usepropsignal.com.`,
      ],
    },
    {
      heading: 'What we collect, and why',
      body: [
        `Your account: your email address, and a display name if you set one. We need these to give you an account and to contact you about the service. Lawful basis: performance of our contract with you.`,
        `Your searches: the postcode and radius you choose, the strategies and lists you tick, and the optional price, bedroom and property-type filters. This is the instruction the product runs on. Lawful basis: performance of our contract.`,
        `What you did with your list: which properties you were shown and when, which you marked as being worked on or not for you, and which you are tracking. This is what lets your list stand week to week rather than resetting, and lets us stop showing you something you have rejected. Lawful basis: performance of our contract.`,
        `Payment records: your Stripe customer and subscription identifiers, the status of your subscription, and the cancellation acknowledgement you gave at checkout with its timestamp and the exact wording shown. We keep the acknowledgement because it is the record of a legal right you waived, and we may need to produce it. We never see or hold your card details. Lawful basis: performance of our contract, and our legal obligations.`,
        `Technical records: a salted, irreversible hash of your IP address when you run the free area check, and server logs. The hash lets us count requests from one origin without keeping the address itself, which is how we stop the free check being used to spend our data credits at scale. Lawful basis: our legitimate interest in preventing abuse of a costly free feature.`,
        `We do not use analytics, advertising or tracking cookies, and there is no third-party tracker on this site. The only cookies we set are the ones that keep you signed in, which are strictly necessary and need no consent.`,
      ],
    },
    {
      heading: 'Property data is not your data',
      body: [
        `Most of what Prop Signal holds is information about properties advertised publicly for sale, obtained under licence from PropertyData. That is not personal data about you, and it is kept and deleted on its own schedule regardless of your account. We never reproduce listing photographs; we link to the original agent advertisement.`,
      ],
    },
    {
      heading: 'Who processes it on our behalf',
      body: [
        `Supabase — our database and sign-in system, and the sender of account emails such as password resets. CONFIRM_REGION`,
        `Stripe — payments and subscription management. Stripe is a controller in its own right for payment data and has its own privacy policy. Stripe may transfer data outside the UK under the UK International Data Transfer Addendum.`,
        `Vercel — hosting for the website and the scheduled jobs. Requests may be served from outside the UK; transfers are covered by standard contractual clauses and the UK Addendum.`,
        `PropertyData — the property data provider. We send them a postcode and search criteria. We do not send them your identity.`,
        `Each of these is bound by a contract that permits them to process your data only on our instructions. We do not sell your data, and nobody receives it for their own marketing.`,
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        `Your account and your searches: for as long as you have an account, and then deleted when you close it.`,
        `Your list history and the record of what you were shown: for as long as you have an account, because it is what makes the list continuous.`,
        `Cached property data from our provider: expires on a schedule of between three and thirty days depending on the figure, and is deleted automatically each night.`,
        `Payment and acknowledgement records: six years after the end of the relationship, which is the period UK tax and limitation rules require. This is the one category we keep after an account is closed, and we keep only what those obligations need.`,
        `Server logs: a short rolling period held by our hosting provider.`,
      ],
    },
    {
      heading: 'Your rights',
      body: [
        `Under the UK GDPR you have the right to ask for a copy of your data, to have it corrected, to have it deleted, to restrict or object to how we use it, and to receive it in a portable form. Where we rely on legitimate interest — the abuse-prevention hash — you may object, and we will stop unless we have compelling grounds.`,
        `To close your account and have your data deleted, write to support@usepropsignal.com. We will do it within 30 days and confirm when it is done, keeping only the payment and acknowledgement records described above.`,
        `If you are unhappy with how we have handled your data, please tell us first. You also have the right to complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113.`,
      ],
    },
    {
      heading: 'Security, and changes to this policy',
      body: [
        `Access to your data is restricted at the database level so that one account cannot read another's, and administrative keys are held only by the server. We will tell you and the Information Commissioner's Office without undue delay if a breach affects your rights.`,
        `If we change this policy we will update the date at the top, and we will email you about anything that materially changes what we do with your data.`,
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
