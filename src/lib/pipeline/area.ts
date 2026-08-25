/**
 * The area-level enrichment, normalised.
 *
 * Field names here were confirmed against live responses on 2026-08-24
 * (`pnpm propertydata:area --spend`). PropertyData document the parameters for
 * these endpoints and not the response bodies, so this is the same situation
 * `listing.ts` is in and it is handled the same way: read through alias lists,
 * and never assume a figure is present.
 *
 * Everything here is keyed on the profile's postcode, so a run pays one credit
 * per endpoint however many candidates it scores.
 *
 * Pure. The payloads are fetched by the credit wrapper and passed in.
 */

export type SoldComparables = {
  /** Average completed £/sq ft nearby. Independent of what anyone is asking. */
  averagePricePerSqFt: number | null
  /** The middle 70% of that sample, which is the honest range to quote. */
  rangeLow: number | null
  rangeHigh: number | null
  transactions: number | null
  latestSale: string | null
  /** Share of nearby sales that were leasehold, 0 to 1. */
  leaseholdShare: number | null
}

export type AreaInsights = {
  postcode: string
  observedAt: string
  sold: SoldComparables
  /** The local gross yield to judge this property's own yield against. */
  localGrossYieldPercent: number | null
  /** "Very Low" through "High", as the API words it. */
  floodRisk: string | null
  council: string | null
  councilRating: string | null
  /** Band D, the conventional reference band. */
  councilTaxBandD: number | null
  /** Capital growth over the last year and the last five, as percentages. */
  growth1YearPercent: number | null
  growth5YearPercent: number | null
  /** Per-address EPC and council tax, for matching a specific property. */
  epcByAddress: Array<{ address: string; rating: string; score: number | null; inspectedOn: string | null }>
  taxBandByAddress: Array<{ address: string; band: string }>

  /**
   * Only fetched for a profile whose strategies need them, because a
   * buy-to-let subscriber should not pay a credit for HMO room rates.
   */
  hmoRoomRatePerMonth: number | null
  /** Registered HMOs nearby. Saturation, or a proven market — stated, not scored. */
  registeredHmosNearby: number | null
  developmentGdvPerSqFt: number | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  // "9.5%" and "1,541.36" both arrive as strings.
  const cleaned = value.replace(/[^\d.-]/g, '')
  if (!cleaned) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * `/sold-prices-per-sqf`.
 *
 * `data.average` is the headline. `raw_data` carries each comparable sale with
 * its own tenure, which is the only tenure signal available anywhere in this
 * API — not for the subject property, but enough to say an area is flats.
 */
export function readSoldComparables(payload: unknown): SoldComparables {
  const data = record(record(payload).data)
  const range = array(data['70pc_range'])
  const raw = array(data.raw_data)

  const tenures = raw
    .map((entry) => asText(record(entry).tenure)?.toLowerCase())
    .filter((tenure): tenure is string => Boolean(tenure))

  return {
    averagePricePerSqFt: asNumber(data.average),
    rangeLow: asNumber(range[0]),
    rangeHigh: asNumber(range[1]),
    transactions: asNumber(data.points_analysed),
    latestSale: asText(data.date_latest),
    leaseholdShare: tenures.length
      ? tenures.filter((tenure) => tenure === 'leasehold').length / tenures.length
      : null,
  }
}

/** `/yields`. The figure arrives as a string with a percent sign on it. */
export function readLocalYield(payload: unknown): number | null {
  const longLet = record(record(record(payload).data).long_let)
  return asNumber(longLet.gross_yield)
}

/**
 * `/rents-hmo`. Live local asking rents for a room in a shared house.
 *
 * An area figure, not a figure about any particular house: it says what a room
 * goes for nearby. Read through aliases like everything else here, because
 * PropertyData document the parameters and not the response body.
 */
export function readHmoRoomRate(payload: unknown): number | null {
  const data = record(record(payload).data)
  const direct = asNumber(data.average ?? data.average_rent ?? data.mean ?? record(payload).average)
  if (direct !== null) return direct

  // Some shapes carry the average inside a long_let-style envelope.
  const nested = record(data.room ?? data.rooms ?? data.per_room)
  return asNumber(nested.average ?? nested.mean)
}

/** `/national-hmo-register`. How many licensed HMOs are already nearby. */
export function readRegisteredHmos(payload: unknown): number | null {
  const data = record(payload).data
  if (Array.isArray(data)) return data.length

  const inner = record(data)
  const counted = asNumber(inner.total ?? inner.count ?? record(payload).total)
  if (counted !== null) return counted

  const rows = array(inner.hmos ?? inner.results ?? inner.register)
  return rows.length ? rows.length : null
}

/**
 * `/development-gdv`. What finished space is worth per square foot locally.
 *
 * Used as the end value for a refurbishment. It is a development figure rather
 * than a refurbishment one, which overstates a light touch-up and understates a
 * full conversion — stated on the breakdown rather than quietly corrected.
 */
export function readDevelopmentGdv(payload: unknown): number | null {
  const data = record(record(payload).data)
  return asNumber(
    data.gdv_per_sqf ?? data.gdv_psf ?? data.per_sqf ?? data.average_price_per_sqf ?? record(payload).gdv_per_sqf,
  )
}

/** `/flood-risk`. A band, worded rather than numbered. */
export function readFloodRisk(payload: unknown): string | null {
  return asText(record(payload).flood_risk)
}

/**
 * `/growth`. An array of `[label, average price, change]` rows, oldest first,
 * with the change as a string and null on the first row.
 */
export function readGrowth(payload: unknown): { oneYear: number | null; fiveYear: number | null } {
  const rows = array(record(payload).data).filter((row): row is unknown[] => Array.isArray(row))
  if (rows.length < 2) return { oneYear: null, fiveYear: null }

  const latest = rows[rows.length - 1]
  const oneYear = asNumber(latest?.[2])

  const latestPrice = asNumber(latest?.[1])
  const fiveBack = rows[Math.max(0, rows.length - 6)]
  const oldPrice = asNumber(fiveBack?.[1])

  const fiveYear =
    latestPrice !== null && oldPrice !== null && oldPrice > 0
      ? Number((((latestPrice - oldPrice) / oldPrice) * 100).toFixed(2))
      : null

  return { oneYear, fiveYear }
}

/** `/energy-efficiency`. One row per certificate in the postcode. */
export function readEpc(payload: unknown): AreaInsights['epcByAddress'] {
  return array(record(payload).energy_efficiency).flatMap((entry) => {
    const row = record(entry)
    const address = asText(row.address)
    const rating = asText(row.rating)
    if (!address || !rating) return []

    return [
      {
        address,
        rating: rating.toUpperCase(),
        score: asNumber(row.score),
        inspectedOn: asText(row.inspection_date)?.slice(0, 10) ?? null,
      },
    ]
  })
}

/** `/council-tax`. Band D as the reference, plus the per-address bands. */
export function readCouncilTax(payload: unknown): {
  council: string | null
  rating: string | null
  bandD: number | null
  byAddress: AreaInsights['taxBandByAddress']
} {
  const root = record(payload)
  const bands = record(root.council_tax)

  return {
    council: asText(root.council),
    rating: asText(root.council_rating),
    bandD: asNumber(bands.band_d),
    byAddress: array(root.properties).flatMap((entry) => {
      const row = record(entry)
      const address = asText(row.address)
      const band = asText(row.band)
      return address && band ? [{ address, band: band.toUpperCase() }] : []
    }),
  }
}

/**
 * Matching a listing address against the per-address rows.
 *
 * The two sources word an address differently — "Apartment 8, 113 Newton
 * Street" against "APARTMENT 8 AT 113, NEWTON STREET, MANCHESTER, M1 1AE" —
 * so both sides are reduced to their digits and letters and one has to contain
 * the other. A near miss returns nothing, which is the right way to fail: a
 * wrong EPC is worse than none.
 */
export function normaliseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bat\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchAddress<T extends { address: string }>(rows: T[], address: string | null): T | null {
  if (!address) return null

  const target = normaliseAddress(address)
  if (target.length < 6) return null

  const targetParts = target.split(' ')

  for (const row of rows) {
    const candidate = normaliseAddress(row.address)
    if (candidate === target) return row

    // Every word of the shorter one present, in order, in the longer one.
    const [shorter, longer] = candidate.length <= target.length ? [candidate, target] : [target, candidate]
    const shorterParts = shorter.split(' ')
    if (shorterParts.length < 2) continue

    let index = 0
    const longerParts = longer.split(' ')
    for (const part of longerParts) {
      if (part === shorterParts[index]) index += 1
      if (index === shorterParts.length) break
    }

    if (index === shorterParts.length && shorterParts.length >= Math.min(3, targetParts.length)) return row
  }

  return null
}
