import { createHash } from 'node:crypto'

/**
 * Turning a `/sourced-properties` result into the shape the pipeline works in.
 *
 * PropertyData's published documentation names only a handful of the fields a
 * sourced property carries — `type`, `type_standardised`, `lists`,
 * `years_remaining`, `highest_offer`, `reduced_by`, `months_on_market`,
 * `plot_size_acres` and `image_url` — and does not show a full example
 * response. Everything else here is read through an alias list rather than a
 * single guessed key, so a reasonable naming is picked up whichever it turns
 * out to be.
 *
 * `pnpm propertydata:sample` prints the field names a real response actually
 * uses. Correct the alias lists below from its output, in one place, and the
 * rest of the pipeline does not change.
 */

export type ListingState = 'listed' | 'sstc' | 'withdrawn'

export type Listing = {
  /** Stable identity for this property within one user's record. */
  key: string
  address: string | null
  postcode: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  listingUrl: string | null
  agent: string | null
  state: ListingState
  daysOnMarket: number | null
  firstListedAt: string | null
  /** Which sourcing lists this property appeared on. */
  lists: string[]
  /** Everything else, kept so a later mapping fix can be applied retroactively. */
  raw: Record<string, unknown>
}

const ALIASES = {
  id: ['id', 'property_id', 'listing_id', 'reference', 'ref'],
  address: ['address', 'display_address', 'full_address', 'title'],
  postcode: ['postcode', 'post_code', 'outcode', 'postcode_district'],
  price: ['price', 'asking_price', 'current_price', 'listed_price'],
  bedrooms: ['bedrooms', 'beds', 'num_bedrooms', 'bedroom_count'],
  bathrooms: ['bathrooms', 'baths', 'num_bathrooms', 'bathroom_count'],
  propertyType: ['type_standardised', 'standardised_type', 'property_type', 'type'],
  listingUrl: ['url', 'listing_url', 'link', 'property_url', 'portal_url'],
  agent: ['agent', 'agent_name', 'branch', 'estate_agent'],
  sstc: ['sstc', 'is_sstc', 'sold_stc', 'under_offer'],
  daysOnMarket: ['days_on_market', 'days_listed', 'listed_days'],
  monthsOnMarket: ['months_on_market', 'months_listed'],
  firstListed: ['first_listed', 'first_listed_date', 'listed_date', 'date_listed', 'first_seen'],
  lists: ['lists', 'list', 'sourcing_lists'],
} as const

function pick(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  return null
}

/** Reads a number out of `£250,000`, `"250000"` or `250000` alike. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const digits = value.replace(/[^\d.-]/g, '')
  if (!digits) return null

  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'y', 'sstc', 'sold stc'].includes(value.trim().toLowerCase())
}

function asDate(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null

  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return null

  return new Date(parsed).toISOString().slice(0, 10)
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  const text = asText(value)
  return text ? text.split(',').map((part) => part.trim()).filter(Boolean) : []
}

/**
 * A stable identity for a property.
 *
 * PropertyData's own id where there is one, because it survives an address
 * being re-typed by an agent. Otherwise a hash of the address and postcode,
 * which is the best available and is stable enough for week-on-week diffing.
 */
export function propertyKey(raw: Record<string, unknown>): string {
  const id = asText(pick(raw, ALIASES.id))
  if (id) return `pd:${id}`

  const url = asText(pick(raw, ALIASES.listingUrl))
  if (url) return `url:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`

  const address = asText(pick(raw, ALIASES.address)) ?? ''
  const postcode = asText(pick(raw, ALIASES.postcode)) ?? ''
  const material = `${address}|${postcode}`.toLowerCase().replace(/\s+/g, ' ').trim()

  return `addr:${createHash('sha256').update(material).digest('hex').slice(0, 24)}`
}

export function normaliseListing(raw: Record<string, unknown>): Listing {
  const monthsOnMarket = asNumber(pick(raw, ALIASES.monthsOnMarket))
  const daysOnMarket = asNumber(pick(raw, ALIASES.daysOnMarket))

  return {
    key: propertyKey(raw),
    address: asText(pick(raw, ALIASES.address)),
    postcode: asText(pick(raw, ALIASES.postcode)),
    price: asNumber(pick(raw, ALIASES.price)),
    bedrooms: asNumber(pick(raw, ALIASES.bedrooms)),
    bathrooms: asNumber(pick(raw, ALIASES.bathrooms)),
    propertyType: asText(pick(raw, ALIASES.propertyType)),
    listingUrl: asText(pick(raw, ALIASES.listingUrl)),
    agent: asText(pick(raw, ALIASES.agent)),
    state: asBoolean(pick(raw, ALIASES.sstc)) ? 'sstc' : 'listed',
    // Months is what the documentation names, so it is the fallback when a day
    // count is absent. Approximate, and only ever used against a threshold.
    daysOnMarket: daysOnMarket ?? (monthsOnMarket === null ? null : Math.round(monthsOnMarket * 30.44)),
    firstListedAt: asDate(pick(raw, ALIASES.firstListed)),
    lists: asList(pick(raw, ALIASES.lists)),
    raw,
  }
}

/** Reads the property array out of a `/sourced-properties` response. */
export function listingsFromPayload(payload: unknown): Listing[] {
  const properties = (payload as { properties?: unknown } | null)?.properties
  if (!Array.isArray(properties)) return []

  return properties
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normaliseListing)
}

// ---------------------------------------------------------------------------
// The optional third question, applied here rather than at the API.
// ---------------------------------------------------------------------------

export type ListingFilter = {
  minPrice: number | null
  maxPrice: number | null
  minBedrooms: number | null
  propertyTypes: string[] | null
}

/** Loose comparison, because the payload's type strings are not our ids. */
function typeMatches(listingType: string | null, wanted: string[]): boolean {
  if (!listingType) return false

  const normalised = listingType.toLowerCase().replace(/[\s-]+/g, '_')
  return wanted.some((type) => {
    const target = type.toLowerCase().replace(/[\s-]+/g, '_')
    return normalised === target || normalised.includes(target) || target.includes(normalised)
  })
}

/**
 * Narrows the payload after it has arrived.
 *
 * `/sourced-properties` would accept a type filter and return fewer results for
 * fewer credits. We do not use it: the weekly diff has to see everything in the
 * area to notice a price reduction, and a property filtered out at the API is a
 * property whose movement we never observe.
 */
export function applyFilter(listings: Listing[], filter: ListingFilter): Listing[] {
  return listings.filter((listing) => {
    if (filter.minPrice !== null && (listing.price === null || listing.price < filter.minPrice)) return false
    if (filter.maxPrice !== null && (listing.price === null || listing.price > filter.maxPrice)) return false
    if (filter.minBedrooms !== null && (listing.bedrooms === null || listing.bedrooms < filter.minBedrooms)) {
      return false
    }
    if (filter.propertyTypes?.length && !typeMatches(listing.propertyType, filter.propertyTypes)) return false

    return true
  })
}
