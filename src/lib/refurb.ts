/**
 * What a refurbishment costs, as a range rather than a figure.
 *
 * We do not hold a refurbishment cost for any property and cannot derive one:
 * `/build-cost` prices building from nothing, and what fraction of that a
 * refurbishment comes to is the invented number this codebase refuses
 * everywhere else. See DECISIONS.md.
 *
 * Asking somebody to type a number into an empty box has the same problem from
 * the other end — most people do not know what a rewire costs per square foot,
 * so the box gets a guess with no anchor at all. So the bands below are what
 * the trade quotes, stated as ranges, labelled as ranges, and left for the
 * subscriber to land inside. They are not a valuation, they are not local to a
 * postcode, and the only real number is a builder's quote.
 *
 * Ranges rather than points, because the spread is the honest part: a rewire in
 * a two-bed terrace and a rewire in a Victorian semi are not the same job.
 */

export type RefurbBand = {
  id: 'light' | 'full' | 'structural'
  label: string
  /** What the work actually is, so somebody can place their own job in a band. */
  detail: string
  perSqFtLow: number
  perSqFtHigh: number
}

export const REFURB_BANDS: readonly RefurbBand[] = [
  {
    id: 'light',
    label: 'Light refresh',
    detail: 'Decoration, flooring, a kitchen and bathroom refresh. Nothing behind the plaster.',
    perSqFtLow: 25,
    perSqFtHigh: 50,
  },
  {
    id: 'full',
    label: 'Full refurbishment',
    detail: 'Rewire, replumb, new kitchen and bathrooms, plaster throughout, new heating.',
    perSqFtLow: 50,
    perSqFtHigh: 100,
  },
  {
    id: 'structural',
    label: 'Structural',
    detail: 'Layout changes, roof or damp work, an extension or a loft.',
    perSqFtLow: 100,
    perSqFtHigh: 175,
  },
] as const

/** The middle of a band, which is what a picker fills the box with. */
export function bandMidpoint(band: RefurbBand): number {
  return Math.round((band.perSqFtLow + band.perSqFtHigh) / 2)
}

/**
 * What a band comes to for a property of this size.
 *
 * Null where no floor area is held, which is the same answer the rest of the
 * product gives for a figure it does not have: nothing, rather than an average.
 */
export function bandTotal(band: RefurbBand, areaSqFt: number | null): { low: number; high: number } | null {
  if (areaSqFt === null || !Number.isFinite(areaSqFt) || areaSqFt <= 0) return null
  return {
    low: Math.round((band.perSqFtLow * areaSqFt) / 100) * 100,
    high: Math.round((band.perSqFtHigh * areaSqFt) / 100) * 100,
  }
}

/** The band a figure per square foot falls in, or null outside all of them. */
export function bandFor(perSqFt: number | null): RefurbBand | null {
  if (perSqFt === null) return null
  return REFURB_BANDS.find((band) => perSqFt >= band.perSqFtLow && perSqFt <= band.perSqFtHigh) ?? null
}
