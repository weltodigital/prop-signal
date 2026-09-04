/**
 * Who is actually trading here.
 *
 * One place, because the Companies Act 2006 trading disclosure regulations and
 * the E-Commerce Regulations 2002 both require these to appear on the website,
 * and a detail scattered through six components is a detail that goes stale in
 * five of them. A change of registered office is one edit here.
 *
 * Deliberately not `server-only` and deliberately not read from the environment:
 * none of it is secret — the whole point is that it is published — and a value
 * that has to be present on every page of a live site should not be able to go
 * missing because an environment variable was not copied into a new deployment.
 *
 * `Prop Signal` is a trading name. `Welto Limited` is the company, and the
 * disclosures name the company, which is the distinction the rules exist to
 * make plain.
 */
export const COMPANY = {
  /** The registered legal name, as filed at Companies House. */
  legalName: 'Welto Limited',
  /** The trading name the product is sold under. */
  tradingName: 'Prop Signal',
  /** Registered in England and Wales. */
  companyNumber: '14630258',
  registeredOffice: '167-169 Great Portland Street, London, England, W1W 5PF',
  jurisdiction: 'England and Wales',
  contactEmail: 'support@usepropsignal.com',
} as const

/** The disclosure as one sentence, for a footer that has a line rather than a block. */
export function tradingDisclosure(): string {
  return `${COMPANY.tradingName} is a trading name of ${COMPANY.legalName}, a company registered in ${COMPANY.jurisdiction} (number ${COMPANY.companyNumber}). Registered office: ${COMPANY.registeredOffice}.`
}
