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
export function formatListName(id: string): string {
  return id
    .replace(/-properties$/, '')
    .split('-')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}
