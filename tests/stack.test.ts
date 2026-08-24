import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS, monthlyInterest, monthlyRepayment, stack, type StackInputs } from '@/lib/stack'

function inputs(overrides: Partial<StackInputs> = {}): StackInputs {
  return {
    ...DEFAULT_INPUTS,
    purchasePrice: 200_000,
    monthlyRent: 1_100,
    postRefurbValue: null,
    ...overrides,
  }
}

describe('the mortgage payment', () => {
  it('charges only the interest when the mortgage is interest only', () => {
    // £150,000 at 6% is £9,000 a year, which is £750 a month.
    expect(monthlyInterest(150_000, 6)).toBeCloseTo(750, 6)
  })

  it('matches the annuity formula on a repayment mortgage', () => {
    // £150,000 over 25 years at 5% is £876.89 by any mortgage calculator.
    expect(monthlyRepayment(150_000, 5, 25)).toBeCloseTo(876.89, 1)
  })

  it('spreads the principal evenly when the rate is zero', () => {
    expect(monthlyRepayment(120_000, 0, 10)).toBeCloseTo(1_000, 6)
  })

  it('is nothing when there is no loan', () => {
    expect(monthlyRepayment(0, 5, 25)).toBe(0)
    expect(monthlyInterest(0, 5)).toBe(0)
  })
})

describe('a buy to let', () => {
  it('puts down the deposit and borrows the rest', () => {
    const result = stack(inputs({ depositPercent: 25 }))
    expect(result.deposit).toBe(50_000)
    expect(result.loan).toBe(150_000)
  })

  it('counts refurb and buying costs as money in', () => {
    const result = stack(inputs({ refurbCost: 15_000, buyingCosts: 9_000 }))
    expect(result.cashIn).toBe(50_000 + 15_000 + 9_000)
  })

  it('takes the mortgage and the running costs off the rent', () => {
    const result = stack(inputs({ annualRatePercent: 6, monthlyCosts: 150 }))
    // £150,000 at 6% interest only is £750. £1,100 less £750 less £150.
    expect(result.monthlyMortgage).toBe(750)
    expect(result.monthlyCashflow).toBe(200)
    expect(result.annualCashflow).toBe(2_400)
  })

  it('reports a loss rather than clamping at zero', () => {
    const result = stack(inputs({ monthlyRent: 500, annualRatePercent: 6 }))
    expect(result.monthlyCashflow).toBe(-250)
  })

  it('works the yield off the purchase price, not the asking price', () => {
    const result = stack(inputs({ purchasePrice: 180_000 }))
    // £13,200 a year against £180,000.
    expect(result.grossYieldPercent).toBeCloseTo(7.33, 2)
  })

  it('omits the percentages rather than dividing by zero', () => {
    const empty = stack(inputs({ purchasePrice: 0, monthlyRent: 0, depositPercent: 0 }))
    expect(empty.grossYieldPercent).toBeNull()
    expect(empty.cashOnCashPercent).toBeNull()
  })
})

describe('a refurbish and refinance', () => {
  it('holds back entirely when no post-refurb value is known', () => {
    expect(stack(inputs()).refinance).toBeNull()
  })

  it('releases the difference between the new loan and the old one', () => {
    const result = stack(inputs({ refurbCost: 20_000, postRefurbValue: 260_000, refinanceLtvPercent: 75 }))
    // 75% of £260,000 is £195,000, against a £150,000 loan.
    expect(result.refinance?.newLoan).toBe(195_000)
    expect(result.refinance?.released).toBe(45_000)
    // £50,000 deposit and £20,000 of works, less the £45,000 released.
    expect(result.refinance?.leftIn).toBe(25_000)
    expect(result.refinance?.allOut).toBe(false)
  })

  it('calls it all out when more comes back than went in', () => {
    const result = stack(inputs({ refurbCost: 10_000, postRefurbValue: 300_000 }))
    // 75% of £300,000 is £225,000 — £75,000 released against £60,000 in.
    expect(result.refinance?.allOut).toBe(true)
    expect(result.refinance?.leftIn).toBeLessThanOrEqual(0)
    // No denominator, so no percentage. Not an enormous number in its place.
    expect(result.refinance?.returnOnLeftInPercent).toBeNull()
  })

  it('returns the money left in as a percentage while any is still in', () => {
    const result = stack(
      inputs({ refurbCost: 20_000, postRefurbValue: 260_000, annualRatePercent: 6, monthlyCosts: 150 }),
    )
    // £2,400 a year against £25,000 left in.
    expect(result.refinance?.returnOnLeftInPercent).toBeCloseTo(9.6, 2)
  })

  it('prices the mortgage that follows the refinance', () => {
    const result = stack(inputs({ postRefurbValue: 260_000, annualRatePercent: 6 }))
    // £195,000 at 6% interest only.
    expect(result.refinance?.newMonthlyMortgage).toBe(975)
  })

  it('shows a top-up as a negative release rather than hiding it', () => {
    const result = stack(inputs({ postRefurbValue: 180_000 }))
    // 75% of £180,000 is £135,000, which is less than the £150,000 owed.
    expect(result.refinance?.released).toBe(-15_000)
  })
})
