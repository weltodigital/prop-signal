/**
 * Stack it — the BRRR and buy-to-let arithmetic.
 *
 * Pure, and deliberately not `server-only`: it runs in the browser against
 * figures already stored, so moving a slider costs nothing. No API call is made
 * from this file or from anything that imports it.
 *
 * Every output is a number the user could have worked out themselves on paper.
 * There is no model here and no opinion — the opinion lives in the scoring, and
 * this is the part where the user substitutes their own numbers for ours.
 *
 * Nothing is estimated on the user's behalf. A missing input yields null and
 * the interface says which figure is absent, rather than filling in an average
 * and presenting the result as an answer.
 */

export type StackInputs = {
  /** What you would pay, not necessarily what is being asked. */
  purchasePrice: number
  /** Works, in full. */
  refurbCost: number
  /** Legals, survey, stamp duty — whatever you carry. Not calculated for you. */
  buyingCosts: number
  /** Deposit as a percentage of the purchase price. */
  depositPercent: number
  /** Annual interest rate on the mortgage. */
  annualRatePercent: number
  /** Term in years. Ignored on an interest-only mortgage. */
  termYears: number
  /** Interest-only is the ordinary buy-to-let case, so it is the default. */
  interestOnly: boolean
  /** Expected monthly rent. */
  monthlyRent: number
  /** Management, insurance, maintenance — the monthly ones. */
  monthlyCosts: number
  /** What it is worth once the works are done. Null when nothing is held. */
  postRefurbValue: number | null
  /** The lender's limit on the refinance. */
  refinanceLtvPercent: number
}

export type StackResult = {
  deposit: number
  loan: number
  /** Deposit, refurb and buying costs. What actually leaves your account. */
  cashIn: number
  /** Interest only, or capital and interest, depending on the input. */
  monthlyMortgage: number
  monthlyCashflow: number
  annualCashflow: number
  /** Annual rent against the purchase price. Null when either is absent. */
  grossYieldPercent: number | null
  /** Annual cashflow against cash in. Null when nothing has been put in. */
  cashOnCashPercent: number | null

  /** The refinance. Null throughout when no post-refurb value is held. */
  refinance: {
    postRefurbValue: number
    newLoan: number
    /** New loan less the loan being repaid. Negative means you top it up. */
    released: number
    /** Cash in, less what came back out. Zero or less is "all out". */
    leftIn: number
    allOut: boolean
    /** Annual cashflow against money left in. Null once you are all out —
     *  the return is not infinite, it is simply not a percentage any more. */
    returnOnLeftInPercent: number | null
    /** The mortgage after refinancing, which the cashflow above does not use. */
    newMonthlyMortgage: number
  } | null
}

export const DEFAULT_INPUTS: Omit<StackInputs, 'purchasePrice' | 'monthlyRent' | 'postRefurbValue'> = {
  refurbCost: 0,
  buyingCosts: 0,
  depositPercent: 25,
  annualRatePercent: 5.5,
  termYears: 25,
  interestOnly: true,
  monthlyCosts: 0,
  refinanceLtvPercent: 75,
}

function round(value: number): number {
  return Math.round(value)
}

function percent(value: number): number {
  return Number(value.toFixed(2))
}

/** Guards every division, so an empty form produces blanks and never NaN. */
function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return percent((numerator / denominator) * 100)
}

/**
 * The monthly payment on a repayment mortgage.
 *
 * The standard annuity formula. At a rate of zero it degenerates, so that case
 * is the principal spread evenly over the term rather than a division by zero.
 */
export function monthlyRepayment(principal: number, annualRatePercent: number, termYears: number): number {
  if (principal <= 0) return 0

  const months = Math.round(termYears * 12)
  if (months <= 0) return principal

  const monthlyRate = annualRatePercent / 100 / 12
  if (monthlyRate <= 0) return principal / months

  const factor = (1 + monthlyRate) ** -months
  return (principal * monthlyRate) / (1 - factor)
}

/** Interest only: the loan never amortises, so the payment is just the interest. */
export function monthlyInterest(principal: number, annualRatePercent: number): number {
  if (principal <= 0 || annualRatePercent <= 0) return 0
  return (principal * (annualRatePercent / 100)) / 12
}

export function stack(inputs: StackInputs): StackResult {
  const price = Math.max(0, inputs.purchasePrice)
  const depositRate = Math.min(100, Math.max(0, inputs.depositPercent)) / 100

  const deposit = round(price * depositRate)
  const loan = round(price - deposit)

  const cashIn = round(deposit + Math.max(0, inputs.refurbCost) + Math.max(0, inputs.buyingCosts))

  const monthlyMortgage = round(
    inputs.interestOnly
      ? monthlyInterest(loan, inputs.annualRatePercent)
      : monthlyRepayment(loan, inputs.annualRatePercent, inputs.termYears),
  )

  const monthlyCashflow = round(Math.max(0, inputs.monthlyRent) - monthlyMortgage - Math.max(0, inputs.monthlyCosts))
  const annualCashflow = monthlyCashflow * 12

  const grossYieldPercent = ratio(Math.max(0, inputs.monthlyRent) * 12, price)
  const cashOnCashPercent = ratio(annualCashflow, cashIn)

  let refinance: StackResult['refinance'] = null

  if (inputs.postRefurbValue !== null && inputs.postRefurbValue > 0) {
    const ltv = Math.min(100, Math.max(0, inputs.refinanceLtvPercent)) / 100
    const newLoan = round(inputs.postRefurbValue * ltv)
    const released = round(newLoan - loan)
    const leftIn = round(cashIn - released)
    const allOut = leftIn <= 0

    refinance = {
      postRefurbValue: round(inputs.postRefurbValue),
      newLoan,
      released,
      leftIn,
      allOut,
      // Once the money is out there is no denominator, and a very large number
      // in its place would be a worse answer than none.
      returnOnLeftInPercent: allOut ? null : ratio(annualCashflow, leftIn),
      newMonthlyMortgage: round(
        inputs.interestOnly
          ? monthlyInterest(newLoan, inputs.annualRatePercent)
          : monthlyRepayment(newLoan, inputs.annualRatePercent, inputs.termYears),
      ),
    }
  }

  return {
    deposit,
    loan,
    cashIn,
    monthlyMortgage,
    monthlyCashflow,
    annualCashflow,
    grossYieldPercent,
    cashOnCashPercent,
    refinance,
  }
}
