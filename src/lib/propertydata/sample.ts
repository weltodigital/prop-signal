import 'server-only'

import { createPropertyDataClient } from './client'

/**
 * Fetches one small page of sourced properties and reports the field names it
 * actually contains.
 *
 * PropertyData do not publish a full example response, so `listing.ts` reads
 * every field through an alias list. This is how those alias lists get
 * corrected: run it once, look at the names, fix them in one place.
 *
 * Costs one credit. Recorded against the account it is run as, like everything
 * else that spends.
 */
export type SampleReport = {
  count: number
  credits: number
  /** Every key seen across the returned properties, with how often it appeared. */
  fields: Array<{ name: string; seen: number; example: string }>
  /** Fields our alias lists do not currently look for. */
  unmapped: string[]
}

const MAPPED = new Set([
  'id', 'property_id', 'listing_id', 'reference', 'ref',
  'address', 'display_address', 'full_address', 'title',
  'postcode', 'post_code', 'outcode', 'postcode_district',
  'price', 'asking_price', 'current_price', 'listed_price',
  'bedrooms', 'beds', 'num_bedrooms', 'bedroom_count',
  'bathrooms', 'baths', 'num_bathrooms', 'bathroom_count',
  'type_standardised', 'standardised_type', 'property_type', 'type',
  'url', 'listing_url', 'link', 'property_url', 'portal_url',
  'agent', 'agent_name', 'branch', 'estate_agent',
  'sstc', 'is_sstc', 'sold_stc', 'under_offer',
  'days_on_market', 'days_listed', 'listed_days',
  'months_on_market', 'months_listed',
  'first_listed', 'first_listed_date', 'listed_date', 'date_listed', 'first_seen',
  'lists', 'list', 'sourcing_lists',
])

export async function sampleSourcedProperties(options: {
  ownerId: string
  postcode: string
  list: string
  radius?: number
}): Promise<SampleReport> {
  const client = createPropertyDataClient({ ownerId: options.ownerId, runCreditCeiling: 5 })

  const response = await client.call<{ properties?: Array<Record<string, unknown>> }>(
    'sourced-properties',
    { list: options.list, postcode: options.postcode, radius: options.radius ?? 20, results: 10 },
    { forceRefresh: true },
  )

  const properties = Array.isArray(response.data.properties) ? response.data.properties : []
  const counts = new Map<string, { seen: number; example: string }>()

  for (const property of properties) {
    for (const [key, value] of Object.entries(property)) {
      const held = counts.get(key) ?? { seen: 0, example: '' }
      held.seen += 1
      if (!held.example && value !== null && value !== '') {
        held.example = typeof value === 'object' ? JSON.stringify(value).slice(0, 60) : String(value).slice(0, 60)
      }
      counts.set(key, held)
    }
  }

  const fields = [...counts.entries()]
    .map(([name, detail]) => ({ name, ...detail }))
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name))

  return {
    count: properties.length,
    credits: response.credits,
    fields,
    unmapped: fields.map((field) => field.name).filter((name) => !MAPPED.has(name)),
  }
}
