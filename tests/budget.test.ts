import { describe, expect, it } from 'vitest'
import { RunBudget } from '@/lib/propertydata/budget'
import { CreditRefusal } from '@/lib/propertydata/errors'
import { estimateCredits, creditsForResponse } from '@/lib/propertydata/endpoints'

describe('RunBudget', () => {
  it('allows spending up to the ceiling', () => {
    const budget = new RunBudget(100)

    budget.assertAffordable(60)
    budget.commit(60)
    budget.assertAffordable(40)
    budget.commit(40)

    expect(budget.remaining()).toBe(0)
  })

  it('refuses the call that would take it over rather than allowing it', () => {
    const budget = new RunBudget(100)
    budget.commit(95)

    expect(() => budget.assertAffordable(10)).toThrow(CreditRefusal)
    expect(budget.spentSoFar()).toBe(95)
  })

  it('refuses everything once aborted', () => {
    const budget = new RunBudget(100)
    budget.abort('X04: out of credits')

    expect(() => budget.assertAffordable(1)).toThrow(CreditRefusal)
    expect(budget.abortedReason()).toBe('X04: out of credits')
  })

  it('keeps the first abort reason rather than overwriting it', () => {
    const budget = new RunBudget(10)
    budget.abort('first')
    budget.abort('second')
    expect(budget.abortedReason()).toBe('first')
  })
})

describe('credit arithmetic', () => {
  it('estimates a sourced-properties page at one credit per ten results', () => {
    expect(estimateCredits('sourced-properties', { results: 10 })).toBe(1)
    expect(estimateCredits('sourced-properties', { results: 25 })).toBe(3)
    expect(estimateCredits('sourced-properties', { results: 500 })).toBe(50)
  })

  it('assumes the default page size when none was asked for', () => {
    expect(estimateCredits('sourced-properties', {})).toBe(1)
  })

  it('never estimates beyond the 500 result maximum per call', () => {
    expect(estimateCredits('sourced-properties', { results: 5_000 })).toBe(50)
  })

  it('charges for what actually came back, not what was asked for', () => {
    expect(creditsForResponse('sourced-properties', { properties: Array(12).fill({}) })).toBe(2)
    expect(creditsForResponse('sourced-properties', { properties: [] })).toBe(0)
  })

  it('charges one credit for a valuation and nothing for the account endpoint', () => {
    expect(creditsForResponse('valuation-sale', {})).toBe(1)
    expect(creditsForResponse('account/credits', {})).toBe(0)
  })

  it('estimates conservatively when the response shape is unknown', () => {
    expect(creditsForResponse('sourced-properties', null)).toBe(0)
    expect(creditsForResponse('sourced-properties', { properties: 'not an array' })).toBe(0)
  })
})
