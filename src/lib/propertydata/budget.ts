import { CreditRefusal } from './errors'

/**
 * The ceiling on what a single run may spend for a single user.
 *
 * A run that would go over aborts rather than overspending. That is the whole
 * point: a bug in the pipeline should cost a run, not a month's credits.
 */
export class RunBudget {
  private spent = 0
  private aborted: string | null = null

  constructor(readonly ceiling: number) {
    if (ceiling < 0) throw new Error('Run credit ceiling cannot be negative')
  }

  remaining(): number {
    return Math.max(0, this.ceiling - this.spent)
  }

  spentSoFar(): number {
    return this.spent
  }

  /** Set when the account itself has failed. Every later call refuses at once. */
  abort(reason: string): void {
    this.aborted ??= reason
  }

  abortedReason(): string | null {
    return this.aborted
  }

  /** Throws rather than allowing an overspend. Call before making a request. */
  assertAffordable(credits: number): void {
    if (this.aborted) {
      throw new CreditRefusal('run_budget', credits, 0)
    }
    if (credits > this.remaining()) {
      throw new CreditRefusal('run_budget', credits, this.remaining())
    }
  }

  /** Records what was actually spent, which may differ from the estimate. */
  commit(credits: number): void {
    this.spent += Math.max(0, credits)
  }
}
