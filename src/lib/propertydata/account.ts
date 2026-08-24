import 'server-only'

import { propertyDataEnv } from '@/lib/env'
import { PropertyDataError, retryAfterMs } from './errors'

/**
 * Reads the account's credit position from `/account/credits`.
 *
 * The one call in this codebase that does not go through the client, because it
 * belongs to no user, spends nothing and exists to answer "is the key working".
 * It lives inside the wrapper anyway, so the rule that nothing outside this
 * directory touches PropertyData stays literally true.
 */
export type AccountCredits = {
  creditsUsed: number | null
  creditsRemaining: number | null
  creditsLimit: number | null
  renewsAt: Date | null
  /** The whole envelope, for anything not broken out above. */
  raw: Record<string, unknown>
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function checkAccount(fetchImpl: typeof fetch = fetch): Promise<AccountCredits> {
  const env = propertyDataEnv()
  const url = new URL('/account/credits', env.PROPERTYDATA_BASE_URL)

  const response = await fetchImpl(url.toString(), {
    headers: { 'X-API-Key': env.PROPERTYDATA_API_KEY, Accept: 'application/json' },
  })

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok || body?.status === 'error' || !body) {
    throw new PropertyDataError({
      message: String(body?.message ?? `/account/credits failed with HTTP ${response.status}`),
      code: (body?.code as string | undefined) ?? null,
      httpStatus: response.status,
      retryAfterMs: retryAfterMs(response.headers),
    })
  }

  // PropertyData wrap the figures in `result`. Reading through it here keeps
  // that shape out of everything downstream.
  const result = (body.result ?? body) as Record<string, unknown>
  const renewsAt = toNumber(result.credits_renew_at)

  return {
    creditsUsed: toNumber(result.credits_used),
    creditsRemaining: toNumber(result.credits_remaining),
    creditsLimit: toNumber(result.credits_limit),
    renewsAt: renewsAt === null ? null : new Date(renewsAt * 1000),
    raw: body,
  }
}

/** The configured limits, for reporting alongside the account position. */
export function configuredLimits(): { ratePer10s: number; runCeiling: number; baseUrl: string } {
  const env = propertyDataEnv()
  return {
    ratePer10s: env.PROPERTYDATA_RATE_LIMIT_PER_10S,
    runCeiling: env.PROPERTYDATA_RUN_CREDIT_CEILING,
    baseUrl: env.PROPERTYDATA_BASE_URL,
  }
}
