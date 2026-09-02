/**
 * One subscriber must not be able to kill everyone else's Sunday.
 *
 * When the PropertyData account runs dry the API answers X04, and the wrapper
 * treats it as fatal because retrying costs money and cannot work. What made
 * that dangerous was everything after: each profile has its own client, so the
 * batch walked on, made one doomed call per remaining subscriber, and — because
 * every attempt wrote a run row — the resumable batch read them as "already
 * done this cycle" and skipped those people until the following Sunday.
 *
 * The rule that fixes it is whose limit was hit, and this pins it.
 */
import { describe, expect, it } from 'vitest'
import { runOutcome } from '@/lib/pipeline/run'
import { CreditRefusal, PropertyDataError } from '@/lib/propertydata'

describe('whose limit was hit', () => {
  it('blocks the batch when the account is the problem', () => {
    // X04 — the monthly plan is exhausted. Nothing about this subscriber
    // caused it and every profile behind them would fail identically.
    const outcome = runOutcome(
      new PropertyDataError({ message: 'Monthly plan limit exceeded', code: 'X04' }),
      'X04: Monthly plan or bolt-on credit limit exceeded',
    )

    expect(outcome.accountBlocked).toBe(true)
    expect(outcome.status).toBe('blocked')
  })

  it('does not block the batch when our own ceiling stopped one run', () => {
    // The per-run ceiling doing its job. One profile stops; the next
    // subscriber is unaffected and must still be run.
    const outcome = runOutcome(new CreditRefusal('run_budget', 50, 10), null)

    expect(outcome.accountBlocked).toBe(false)
    expect(outcome.status).toBe('aborted')
  })

  it('does not block the batch when one subscriber is out of allowance', () => {
    // Their allowance, not the account's. Everybody else still has theirs.
    const outcome = runOutcome(new CreditRefusal('allowance', 50, 0), null)

    expect(outcome.accountBlocked).toBe(false)
    expect(outcome.status).toBe('aborted')
  })

  it('records an ordinary bug as failed, and carries on', () => {
    const outcome = runOutcome(new Error('a null crept in'), null)

    expect(outcome.accountBlocked).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('treats an account abort as blocking even alongside a refusal', () => {
    // Once the account is dead the wrapper refuses every later call, so the
    // error that surfaces is a CreditRefusal while the abort reason is the
    // real cause. The abort reason has to win, or a dead account would read as
    // an ordinary per-run stop and the batch would grind through everyone.
    const outcome = runOutcome(new CreditRefusal('run_budget', 10, 0), 'X04: limit exceeded')

    expect(outcome.accountBlocked).toBe(true)
    expect(outcome.status).toBe('blocked')
  })
})
