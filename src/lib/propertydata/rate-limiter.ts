/**
 * Token bucket for the plan's rate limit.
 *
 * PropertyData allows between 4 and 24 requests per ten seconds depending on
 * plan. Going over returns X14 and wastes a round trip, so we pace ourselves
 * rather than discovering the limit by hitting it.
 *
 * In-process, which is the right scope for v1: the weekly pipeline is a single
 * run in a single process. If a second process ever calls the API at the same
 * time this stops being sufficient, and the retry on X14 is the backstop.
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    if (capacity <= 0) throw new Error('Rate limit capacity must be at least 1')
    this.tokens = capacity
    this.lastRefill = now()
  }

  private refill(): void {
    const elapsed = this.now() - this.lastRefill
    if (elapsed <= 0) return

    const gained = (elapsed / this.windowMs) * this.capacity
    if (gained <= 0) return

    this.tokens = Math.min(this.capacity, this.tokens + gained)
    this.lastRefill = this.now()
  }

  /** Waits until a request may be made, then consumes its token. */
  async take(): Promise<void> {
    for (;;) {
      this.refill()

      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }

      const deficit = 1 - this.tokens
      const waitMs = Math.ceil((deficit / this.capacity) * this.windowMs)
      await this.sleep(Math.max(waitMs, 10))
    }
  }

  /** Tokens currently available. Exposed for tests and logging. */
  available(): number {
    this.refill()
    return this.tokens
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
