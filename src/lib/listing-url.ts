/**
 * Where "view the original listing" should actually go.
 *
 * Listing URLs arrive as a redirect through our data supplier:
 * `.../outbound/rightmove/165082280`. The portal and the listing id are both in
 * the path, so the portal's own page is derivable without another call.
 *
 * Sending somebody straight to Rightmove is one hop rather than two, and the
 * link they see on hover is the site they expect rather than one they have
 * never heard of.
 *
 * Only Rightmove is mapped. The Rightmove form is confirmed to resolve; the
 * others are not, and a link that 404s is worse than a link with an extra hop,
 * so anything unrecognised is passed through untouched.
 *
 * Pure, and safe on anything: a null, an empty string, or a URL that has
 * nothing to do with any of this all come back unchanged.
 */

const OUTBOUND = /^https?:\/\/(?:www\.)?propertydata\.co\.uk\/outbound\/([a-z0-9-]+)\/([0-9]+)\/?$/i

const PORTALS: Record<string, (id: string) => string> = {
  rightmove: (id) => `https://www.rightmove.co.uk/properties/${id}`,
}

export function directListingUrl(url: string | null | undefined): string | null {
  if (!url) return null

  const match = OUTBOUND.exec(url.trim())
  if (!match) return url

  const [, portal, id] = match
  const build = portal ? PORTALS[portal.toLowerCase()] : undefined

  return build && id ? build(id) : url
}

/** The portal a listing lives on, for the link's wording. Null when unknown. */
export function listingPortal(url: string | null | undefined): string | null {
  if (!url) return null

  const match = OUTBOUND.exec(url.trim())
  const portal = match?.[1]?.toLowerCase()

  return portal && PORTALS[portal] ? 'Rightmove' : null
}
