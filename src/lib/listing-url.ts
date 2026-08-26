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
 * All three formats come from the supplier's own redirect rather than a guess:
 * `/outbound/{portal}/{id}/forward` answers 302 with the real listing, so each
 * mapping below was read off a live response.
 *
 * An earlier version mapped Rightmove alone because a plain request to Zoopla
 * came back 403. That was Cloudflare refusing curl, not a bad URL, and taking it
 * as evidence left Zoopla listings landing on the supplier's own page. Guessing
 * a URL is wrong; so is reading a bot block as a broken link.
 *
 * Anything unrecognised is still passed through untouched, because a link with
 * an extra hop beats a link that 404s.
 *
 * Pure, and safe on anything: a null, an empty string, or a URL that has
 * nothing to do with any of this all come back unchanged.
 */

const OUTBOUND = /^https?:\/\/(?:www\.)?propertydata\.co\.uk\/outbound\/([a-z0-9-]+)\/([0-9]+)\/?$/i

const PORTALS: Record<string, { name: string; url: (id: string) => string }> = {
  rightmove: { name: 'Rightmove', url: (id) => `https://www.rightmove.co.uk/properties/${id}` },
  zoopla: { name: 'Zoopla', url: (id) => `https://www.zoopla.co.uk/for-sale/details/${id}/` },
  // The supplier's key for OnTheMarket is abbreviated; the site's is not.
  otm: { name: 'OnTheMarket', url: (id) => `https://www.onthemarket.com/details/${id}/` },
}

export function directListingUrl(url: string | null | undefined): string | null {
  if (!url) return null

  const match = OUTBOUND.exec(url.trim())
  if (!match) return url

  const [, portal, id] = match
  const known = portal ? PORTALS[portal.toLowerCase()] : undefined

  return known && id ? known.url(id) : url
}

/** The portal a listing lives on, for the link's wording. Null when unknown. */
export function listingPortal(url: string | null | undefined): string | null {
  if (!url) return null

  const match = OUTBOUND.exec(url.trim())
  const portal = match?.[1]?.toLowerCase()

  return (portal && PORTALS[portal]?.name) ?? null
}
