/**
 * PropertyData failure modes, sorted into the three that matter to us.
 *
 *   retryable   Transient. Wait and try again.
 *   fatal       The account is out of credits or shut off. Stop the whole run;
 *               retrying costs money and will not work.
 *   otherwise   This call failed. Move on to the next candidate.
 */

export type ErrorKind = 'retryable' | 'fatal' | 'call_failed'

/** Codes that mean the account itself is the problem. Abort the run. */
const FATAL_CODES = new Set([
  'X04', // Monthly plan or bolt-on credit limit exceeded
  'X05', // Account cancelled or card declined
  'X13', // Free trial credit limit exceeded
  'X03', // Invalid API key
])

/** Codes worth waiting out. */
const RETRYABLE_CODES = new Set([
  'X14', // Rate limit: too many calls in 10 seconds
  'X20', // Server busy. No credits used.
  'X09', // Uncaught exception at their end
])

export class PropertyDataError extends Error {
  readonly code: string | null
  readonly httpStatus: number | null
  readonly kind: ErrorKind
  readonly retryAfterMs: number | null

  constructor(options: {
    message: string
    code?: string | null
    httpStatus?: number | null
    retryAfterMs?: number | null
  }) {
    super(options.message)
    this.name = 'PropertyDataError'
    this.code = options.code ?? null
    this.httpStatus = options.httpStatus ?? null
    this.retryAfterMs = options.retryAfterMs ?? null
    this.kind = classify(this.code, this.httpStatus)
  }
}

export function classify(code: string | null, httpStatus: number | null): ErrorKind {
  if (code && FATAL_CODES.has(code)) return 'fatal'
  if (code && RETRYABLE_CODES.has(code)) return 'retryable'

  if (httpStatus === 429) return 'retryable'
  if (httpStatus !== null && httpStatus >= 500) return 'retryable'

  return 'call_failed'
}

/** Raised when the wrapper declines to spend, before any call is made. */
export class CreditRefusal extends Error {
  readonly reason: 'allowance' | 'run_budget'
  readonly required: number
  readonly available: number

  constructor(reason: 'allowance' | 'run_budget', required: number, available: number) {
    const scope = reason === 'allowance' ? 'monthly allowance' : 'budget for this run'
    super(`Refused: the call needs ${required} credits and the ${scope} has ${available} left.`)
    this.name = 'CreditRefusal'
    this.reason = reason
    this.required = required
    this.available = available
  }
}

/** Reads Stripe-style and PropertyData-style Retry-After headers. */
export function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get('retry-after')
  if (!raw) return null

  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const date = Date.parse(raw)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null
}
