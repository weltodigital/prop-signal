import { createHash } from 'node:crypto'

/**
 * Turning a `/sourced-properties` result into the shape the pipeline works in.
 *
 * The alias lists below were confirmed against a live response on 2026-08-24
 * (`pnpm propertydata:sample`). A real sourced property carries:
 *
 *   address  precise_address  postcode  lat  lng  distance_to
 *   price  price_history  reduced_by  days_since_price_change
 *   bedrooms  sqf  type  type_standardised
 *   days_on_market  sstc  id  url  summary
 *
 * Notably absent: bathrooms, agent, and any first-listed date. `lists` appears
 * only when several lists are queried together. `image_url` is documented but
 * never reaches here — the wrapper strips image fields before anything is
 * stored, which is the point of doing it there.
 *
 * The first alias in each list is the confirmed name; the rest are kept as a
 * cushion in case PropertyData rename something.
 */

export type ListingState = 'listed' | 'sstc' | 'withdrawn'

/** One dated entry from PropertyData's own price history for a listing. */
export type PriceHistoryEntry = { date: string; price: number }

export type Listing = {
  /** Stable identity for this property within one user's record. */
  key: string
  address: string | null
  /** The full address where the payload carries one; often absent. */
  preciseAddress: string | null
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
  /** Internal area in square feet. Sharpens the sale valuation when present. */
  internalAreaSqFt: number | null
  /** Total reduction from the original asking price, as a percentage. */
  reducedByPercent: number | null
  /** Days since the asking price last moved. */
  daysSincePriceChange: number | null
  /**
   * PropertyData's own dated price history, oldest first.
   *
   * This is the most valuable field in the payload. It means a property's
   * reductions are known the first time we ever see it, rather than only from
   * whatever we happen to observe week by week.
   */
  priceHistory: PriceHistoryEntry[]
  /** Which sourcing lists this property appeared on. */
  lists: string[]
  /** Everything else, kept so a later mapping fix can be applied retroactively. */
  raw: Record<string, unknown>
}

/**
 * The field names we look for, in order of preference.
 *
 * Exported so `propertydata:sample` can report what a live response carries
 * that we do not read, without keeping a second copy of this list that goes
 * stale the moment this one changes.
 */
export const ALIASES = {
  id: ['id', 'property_id', 'listing_id', 'reference', 'ref'],
  address: ['address', 'display_address', 'full_address', 'title'],
  preciseAddress: ['precise_address', 'full_address'],
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
  firstListed: ['first_listed', 'first_listed_date', 'listed_date', 'date_listed'],
  internalArea: ['sqf', 'internal_area', 'floor_area', 'sq_ft'],
  reducedBy: ['reduced_by', 'reduction_percent'],
  daysSincePriceChange: ['days_since_price_change', 'days_since_reduction'],
  priceHistory: ['price_history', 'prices', 'history'],
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

/**
 * Reads `price_history`, which arrives as `[{date, price}, ...]`.
 *
 * Sorted oldest first and stripped of anything unreadable, so the caller can
 * walk consecutive pairs without checking each one.
 */
export function asPriceHistory(value: unknown): PriceHistoryEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const record = entry as Record<string, unknown>

      const date = asDate(record.date ?? record.on ?? record.changed_at)
      const price = asNumber(record.price ?? record.value ?? record.amount)
      if (!date || price === null) return []

      return [{ date, price }]
    })
    .sort((a, b) => a.date.localeCompare(b.date))
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
    preciseAddress: asText(pick(raw, ALIASES.preciseAddress)),
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
    internalAreaSqFt: asNumber(pick(raw, ALIASES.internalArea)),
    reducedByPercent: asNumber(pick(raw, ALIASES.reducedBy)),
    daysSincePriceChange: asNumber(pick(raw, ALIASES.daysSincePriceChange)),
    priceHistory: asPriceHistory(pick(raw, ALIASES.priceHistory)),
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
