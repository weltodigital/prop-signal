import 'server-only'

import { createPropertyDataClient } from './client'
import type { EndpointName } from './endpoints'

/**
 * Reports what the area-level endpoints actually return.
 *
 * PropertyData document the parameters for these and not the response bodies —
 * the OpenAPI spec says "Successful response" and stops. Rather than guess at
 * field names a second time, this asks once and prints what came back, which is
 * how `listing.ts` got its alias lists corrected.
 *
 * One credit per endpoint. Nothing here is called by the pipeline.
 */
export const AREA_ENDPOINTS: EndpointName[] = [
  'sold-prices-per-sqf',
  'yields',
  'energy-efficiency',
  'flood-risk',
  'council-tax',
  'growth',
  'build-cost',
]

export type AreaSampleResult = {
  endpoint: EndpointName
  credits: number
  /** The whole payload, trimmed. These are small, unlike a property list. */
  payload: unknown
  error?: string
}

export async function sampleAreaEndpoints(options: {
  ownerId: string
  postcode: string
  only?: EndpointName[]
}): Promise<AreaSampleResult[]> {
  const client = createPropertyDataClient({ ownerId: options.ownerId, runCreditCeiling: 20 })
  const endpoints = options.only?.length ? options.only : AREA_ENDPOINTS

  const results: AreaSampleResult[] = []

  for (const endpoint of endpoints) {
    try {
      const response = await client.call<unknown>(endpoint, { postcode: options.postcode }, { forceRefresh: true })
      results.push({ endpoint, credits: response.credits, payload: response.data })
    } catch (error) {
      // One endpoint refusing a postcode must not cost the rest of the probe.
      results.push({
        endpoint,
        credits: 0,
        payload: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
