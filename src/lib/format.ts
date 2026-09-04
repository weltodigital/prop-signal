/**
 * Formatting, shared by the server components and the calculator in the
 * browser. Pure, so both can use it.
 *
 * UK spelling and a dry register throughout. Where a figure is not held we say
 * so in words rather than printing a dash, because a dash reads as zero.
 */

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const NOT_HELD = 'Not held'

export function formatMoney(pounds: number | null | undefined, absent = NOT_HELD): string {
  if (pounds === null || pounds === undefined || !Number.isFinite(pounds)) return absent
  return money.format(pounds)
}

/** Keeps the sign, which is the whole point on a cashflow line. */
export function formatSignedMoney(pounds: number | null | undefined, absent = NOT_HELD): string {
  if (pounds === null || pounds === undefined || !Number.isFinite(pounds)) return absent
  return pounds < 0 ? `−${money.format(Math.abs(pounds))}` : money.format(pounds)
}

export function formatPercent(value: number | null | undefined, places = 1, absent = NOT_HELD): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return absent
  return `${value.toFixed(places)}%`
}

export function formatDate(iso: string | null | undefined, absent = 'unknown'): string {
  if (!iso) return absent
  return longDate.format(new Date(iso))
}

export function formatShortDate(iso: string | null | undefined, absent = 'unknown'): string {
  if (!iso) return absent
  return shortDate.format(new Date(iso))
}

export function formatArea(sqft: number | null | undefined): string {
  if (sqft === null || sqft === undefined || !Number.isFinite(sqft)) return NOT_HELD
  return `${sqft.toLocaleString('en-GB')} sq ft`
}

/** "3 bedrooms", and "Studio" where the payload says nothing. */
export function formatBedrooms(bedrooms: number | null | undefined): string {
  if (bedrooms === null || bedrooms === undefined) return NOT_HELD
  if (bedrooms === 0) return 'Studio'
  return `${bedrooms} ${bedrooms === 1 ? 'bedroom' : 'bedrooms'}`
}

/** How long ago, in whole days, for a line that is about elapsed time. */
export function daysBetween(from: string, to: Date = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000))
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'unknown'
  const days = daysBetween(iso)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 31) return `${days} days ago`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'} ago`
  return `${Math.round(months / 12)} years ago`
}

/** `reduced-properties` reads as "Reduced" on a card. */
/**
 * What a sourcing list is called on a card, and how much it is worth saying.
 *
 * The subscriber picked which of these to search, so the card is not telling
 * them something new — it is telling them which of their own boxes this
 * property came out of, which is the difference between a list of results and a
 * list they can act on. The ordering is what makes it usable: a property is
 * often on three of these, and "repossession" is the one worth the space over
 * "price reduced".
 *
 * Ordered by how much the situation says about the seller rather than by how
 * common it is. Repossession, auction and short lease are a forced sale or a
 * hard deadline; unmodernised and large plot are room to add value; reduced,
 * slow to sell and high yield are the softest of the eight and the ones most
 * likely to be true of half a list.
 */
const SITUATIONS: Array<{ id: string; label: string }> = [
  { id: 'repossessed-properties', label: 'Repossession' },
  { id: 'auction-properties', label: 'Going to auction' },
  { id: 'short-lease-properties', label: 'Short lease' },
  { id: 'unmodernised-properties', label: 'Needs work' },
  { id: 'large-plot', label: 'Large plot' },
  { id: 'slow-to-sell-properties', label: 'Slow to sell' },
  { id: 'reduced-properties', label: 'Price reduced' },
  { id: 'high-yield-properties', label: 'High yield' },
]

/**
 * The situations a property was found in, most telling first.
 *
 * An id we do not have a label for is still shown, tidied up, rather than
 * dropped: a ninth list enabled tomorrow should read as itself on the card
 * before anybody gets round to naming it here.
 */
export function situationsFor(lists: readonly string[]): string[] {
  const known = SITUATIONS.filter((situation) => lists.includes(situation.id)).map((s) => s.label)
  const rest = lists
    .filter((id) => !SITUATIONS.some((situation) => situation.id === id))
    .map((id) => formatListName(id))

  return [...known, ...rest]
}

export function formatListName(id: string): string {
  return id
    .replace(/-properties$/, '')
    .split('-')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}
