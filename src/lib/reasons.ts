import type { PublishedDeal, ScoreFactor } from '@/lib/deals'
import { STRATEGY_DEFINITIONS, isInvestmentStrategy } from '@/lib/strategies'

/**
 * Why this property is in front of you, in a sentence you can act on.
 *
 * The score answers "which of these first". It does not answer "why am I
 * looking at this at all", and that is the question somebody running an eye
 * down a list is actually asking. A number out of 150 cannot answer it: it is
 * the conclusion with the reasoning thrown away.
 *
 * So the reasons are rebuilt from the factors the score was made of. Same data,
 * same run, no second opinion — the breakdown on the property page and these
 * lines are the same arithmetic said two ways, which is why they can never
 * disagree.
 *
 * Deliberately short and deliberately few. Three reasons is a glance; eight is
 * a report, and a list of eight reasons per property is the spreadsheet this
 * product exists to replace.
 *
 * Pure, and not `server-only` — the card renders it.
 */

/** A factor has to earn most of what was available to be worth stating. */
const NOTABLE = 0.45

/** Nobody scans more than this per property. */
const MAX_REASONS = 3

function share(factor: ScoreFactor): number {
  const available = factor.available ?? 0
  if (available <= 0) return 0
  return factor.points / available
}

/** The first number in a detail string, e.g. "18.3% below…" → 18.3 */
function firstNumber(detail: string): number | null {
  const match = detail.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The money figure a strategy return detail opens with, kept verbatim.
 *
 * The scorer appends where the figure placed in its cohort — useful in the
 * breakdown, noise in a one-line reason. Every suffix it can append is cut
 * here, so a reason is the figure and nothing else.
 */
function leadClause(detail: string): string {
  const suffixes = [', better than', ', the only one', ', scored evenly']

  return suffixes.reduce((text, suffix) => text.split(suffix)[0]!, detail).trim()
}

/**
 * One factor, as a phrase — or null where it says nothing worth the line.
 *
 * Matched on the label the scorer wrote rather than on position, because the
 * factors are stored with the impression and an old one may carry labels from
 * a scoring version that ordered them differently.
 */
function phrase(factor: ScoreFactor, strategyLabel: string): string | null {
  const { label, detail } = factor

  if (label.startsWith('Monthly cashflow') || label.startsWith('Money back out')) {
    const lead = leadClause(detail)
    return lead ? `${lead} as ${strategyLabel === 'HMO' ? 'an HMO' : `a ${strategyLabel.toLowerCase()}`}` : null
  }

  if (label === 'Price against nearby sales') {
    const percent = firstNumber(detail)
    if (percent === null || percent <= 0) return null
    return `${Math.round(percent)}% below nearby sold prices per sq ft`
  }

  if (label === 'Local demand') {
    const rating = firstNumber(detail)
    if (rating === null) return null
    return rating >= 65 ? 'Strong local demand' : 'Steady local demand'
  }

  if (label === 'Room to add value') {
    // "Also on needs-work and auction, which you did not ask for"
    const lists = detail.replace(/^Also on /, '').split(', which')[0]
    return lists && detail.startsWith('Also on') ? `Also on ${lists}` : null
  }

  if (label === 'Price reduced') {
    const percent = firstNumber(detail)
    return percent === null ? 'Price reduced' : `Reduced ${Math.round(percent)}% from its peak`
  }

  if (label.startsWith('Reduced ') && label.includes('times')) {
    const percent = firstNumber(detail)
    const times = firstNumber(label)
    if (percent === null || times === null) return 'Reduced more than once'
    return `Reduced ${times} times, ${Math.round(percent)}% off its peak`
  }

  if (label === 'Back on the market') return 'Back on the market after a fall-through'

  if (label === 'Slow to sell') {
    const days = firstNumber(detail)
    return days === null ? 'Slow to sell' : `${Math.round(days)} days unsold`
  }

  // Recency is about when, not what. It sharpens another reason rather than
  // being one, so it never earns a line of its own.
  if (label === 'Recency') return null

  return null
}

/**
 * The strongest things true about this property, strongest first.
 *
 * Quality before movement, because quality is why it qualifies and movement is
 * only ever a reason to look sooner. A property with a motivated seller and
 * nothing else to recommend it does not reach a list at all, and a reason list
 * that opened with the reduction would imply otherwise.
 */
export function reasonsFor(deal: PublishedDeal): string[] {
  const strategy =
    deal.winningStrategy && isInvestmentStrategy(deal.winningStrategy)
      ? STRATEGY_DEFINITIONS[deal.winningStrategy].label
      : 'buy to let'

  const rank = (factors: ScoreFactor[]) =>
    factors
      .map((factor) => ({ factor, share: share(factor) }))
      .filter((entry) => entry.share >= NOTABLE)
      .sort((a, b) => b.share - a.share)
      .map((entry) => phrase(entry.factor, strategy))
      .filter((line): line is string => line !== null)

  const quality = rank(deal.qualityFactors ?? [])
  const movement = rank(deal.movementFactors ?? [])

  const seen = new Set<string>()
  const reasons: string[] = []

  for (const line of [...quality, ...movement]) {
    if (seen.has(line)) continue
    seen.add(line)
    reasons.push(line)
    if (reasons.length === MAX_REASONS) break
  }

  return reasons
}

/**
 * What has happened to this property since the subscriber last looked.
 *
 * Separate from the reasons above, and shown separately, because they answer
 * different questions: the reasons say why it is worth attention at all, and
 * this says why it is worth attention *again*. Collapsing them would make a
 * property that has done nothing since Monday look like news.
 */
export function changeFor(deal: PublishedDeal): string | null {
  if (!deal.changedSinceSeen) return null
  return deal.headline
}
