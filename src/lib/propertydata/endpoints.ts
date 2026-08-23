/**
 * The endpoints Prop Signal is allowed to call, what each costs, and how long
 * its response may be treated as current.
 *
 * Adding an entry here is the only way to reach a new PropertyData endpoint.
 * That is deliberate — every line in this table is money.
 *
 * TTLs are a judgement about how fast the underlying thing changes, capped
 * absolutely at 60 days by PropertyData's terms and by a database constraint.
 */

export const DAY_MS = 86_400_000

/** PropertyData's storage limit. Nothing may claim to be current for longer. */
export const MAX_PAYLOAD_AGE_MS = 60 * DAY_MS

export type EndpointName =
  | 'sourced-properties'
  | 'valuation-sale'
  | 'valuation-rent'
  | 'demand'
  | 'demand-rent'
  | 'account/credits'

export type EndpointSpec = {
  /** Path under the API base URL. */
  path: string
  /**
   * How long a response may be served as current data.
   *
   * The weekly run is the thing these are chosen around. Anything the run
   * needs fresh every week has a TTL comfortably under seven days; anything
   * that moves slowly is held longer so we are not paying for it twice.
   */
  ttlMs: number
  /**
   * Credits a successful call costs. A number where it is fixed, a function
   * where it depends on what came back.
   */
  cost: number | ((payload: unknown) => number)
  /** Short note on why the TTL is what it is. Read by nobody but the next person. */
  reason: string
}

/** `/sourced-properties` charges one credit per ten results returned. */
function sourcedPropertiesCost(payload: unknown): number {
  const properties = (payload as { properties?: unknown[] } | null)?.properties
  const count = Array.isArray(properties) ? properties.length : 0
  return Math.ceil(count / 10)
}

export const ENDPOINTS: Record<EndpointName, EndpointSpec> = {
  'sourced-properties': {
    path: '/sourced-properties',
    ttlMs: 3 * DAY_MS,
    cost: sourcedPropertiesCost,
    reason:
      'The weekly diff needs a fresh pull every Sunday. Three days covers a retry or a re-run inside the same window without paying twice, and expires well before the next run.',
  },
  'valuation-sale': {
    path: '/valuation-sale',
    ttlMs: 30 * DAY_MS,
    cost: 1,
    reason: 'Comparable sale values move over months, not days.',
  },
  'valuation-rent': {
    path: '/valuation-rent',
    ttlMs: 30 * DAY_MS,
    cost: 1,
    reason: 'Achievable rent for a postcode moves over months, not days.',
  },
  demand: {
    path: '/demand',
    ttlMs: 30 * DAY_MS,
    cost: 1,
    reason: 'Area-level and slow. Shared by every candidate in the same area, so this TTL saves the most credits of any entry here.',
  },
  'demand-rent': {
    path: '/demand-rent',
    ttlMs: 30 * DAY_MS,
    cost: 1,
    reason: 'Area-level and slow, as above.',
  },
  'account/credits': {
    path: '/account/credits',
    ttlMs: 5 * 60_000,
    cost: 0,
    reason: 'Free to call, but there is no reason to ask more than once every few minutes.',
  },
}

export function endpointSpec(name: EndpointName): EndpointSpec {
  const spec = ENDPOINTS[name]
  if (!spec) throw new Error(`Unknown PropertyData endpoint: ${name}`)
  return spec
}

/** Credits a successful response cost, given the payload that came back. */
export function creditsForResponse(name: EndpointName, payload: unknown): number {
  const { cost } = endpointSpec(name)
  return typeof cost === 'function' ? cost(payload) : cost
}

/**
 * Worst-case credits a call could cost, computed before it is made so the
 * allowance check has something to check against.
 *
 * For `/sourced-properties` that is the page size, since we cannot know how
 * many results will come back until they do.
 */
export function estimateCredits(name: EndpointName, params: Record<string, unknown>): number {
  if (name !== 'sourced-properties') {
    const { cost } = endpointSpec(name)
    return typeof cost === 'function' ? 1 : cost
  }

  const requested = Number(params.results ?? 10)
  const pageSize = Number.isFinite(requested) && requested > 0 ? requested : 10
  return Math.ceil(Math.min(pageSize, 500) / 10)
}
