/**
 * How far a subscriber has got with a property.
 *
 * Six forward stages and three ways out. The exits are not decoration: without
 * them a dead deal sits at "viewing" for ever, and "how many complete" — the
 * whole reason for recording any of this — reads far higher than the truth.
 *
 * All three exits are kept apart because they are different problems. Passing
 * is choosing not to proceed, which says something about the properties being
 * surfaced. Falling through is losing it after an offer, which says something
 * about the market. Delisting is the seller taking the property away while the
 * subscriber was still working it, which says nothing about either — and
 * folding it into one of the other two would put a fault in the numbers we are
 * collecting the numbers to find.
 *
 * Deliberately not `server-only`: the control on the deal card needs these
 * labels, and nothing here touches the database.
 */

export const DEAL_STAGES = [
  'interested',
  'contacted',
  'viewing',
  'offer',
  'accepted',
  'completed',
  'passed',
  'fell_through',
  'delisted',
] as const

export type DealStage = (typeof DEAL_STAGES)[number]

export function isDealStage(value: string): value is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(value)
}

export type StageDefinition = {
  id: DealStage
  label: string
  /** What the subscriber did, in the past tense, for the timeline. */
  happened: string
  /**
   * Where it sits in the forward run. Terminal stages share the position of
   * the step they end, so ordering a mixed list still reads sensibly.
   */
  step: number
  /** Nothing follows a terminal stage unless the subscriber reopens it. */
  terminal: boolean
  /** Terminal and unsuccessful. Counted out of the funnel rather than into it. */
  lost: boolean
  /**
   * True where only the weekly run may write this stage.
   *
   * The stage control offers what the subscriber can say happened. Nobody
   * chooses to have a property withdrawn from the market, so nothing offers it.
   */
  systemOnly?: boolean
}

export const STAGE_DEFINITIONS: Record<DealStage, StageDefinition> = {
  interested: {
    id: 'interested',
    label: 'Interested',
    happened: 'Marked as one to look at',
    step: 1,
    terminal: false,
    lost: false,
  },
  contacted: {
    id: 'contacted',
    label: 'Contacted',
    happened: 'Got in touch with the agent',
    step: 2,
    terminal: false,
    lost: false,
  },
  viewing: {
    id: 'viewing',
    label: 'Viewing',
    happened: 'Booked or been to a viewing',
    step: 3,
    terminal: false,
    lost: false,
  },
  offer: {
    id: 'offer',
    label: 'Offer made',
    happened: 'Put an offer in',
    step: 4,
    terminal: false,
    lost: false,
  },
  accepted: {
    id: 'accepted',
    label: 'Offer accepted',
    happened: 'Had an offer accepted',
    step: 5,
    terminal: false,
    lost: false,
  },
  completed: {
    id: 'completed',
    label: 'Completed',
    happened: 'Completed',
    step: 6,
    terminal: true,
    lost: false,
  },
  passed: {
    id: 'passed',
    label: 'Passed',
    happened: 'Decided against it',
    step: 6,
    terminal: true,
    lost: true,
  },
  fell_through: {
    id: 'fell_through',
    label: 'Fell through',
    happened: 'Lost it after an offer',
    step: 6,
    terminal: true,
    lost: true,
  },
  delisted: {
    id: 'delisted',
    label: 'No longer listed',
    happened: 'Came off the market while you were working it',
    step: 6,
    terminal: true,
    lost: true,
    systemOnly: true,
  },
}

/** The forward run, in order. What the control offers as "the next step". */
export const FORWARD_STAGES = DEAL_STAGES.filter((stage) => !STAGE_DEFINITIONS[stage].terminal || stage === 'completed')

/**
 * The ways out the subscriber can choose, offered separately so they read as
 * exits rather than progress.
 *
 * `delisted` is not here. It is not a decision anybody makes, so there is
 * nothing to offer — the run writes it when the property leaves the market.
 */
export const EXIT_STAGES: DealStage[] = ['passed', 'fell_through']

/**
 * Stages at which a delisting is news rather than the subscriber's own deal
 * progressing.
 *
 * A property under offer to you comes off the portals — that is what an
 * accepted offer looks like from the outside — so a run that marked those
 * delisted would be recording your own purchase as a lost deal. Below an
 * offer there is no such ambiguity: the property went and you were not the
 * reason.
 */
export const DELISTABLE_STAGES: DealStage[] = ['interested', 'contacted', 'viewing']

/** True where the deal is still live and belongs in the working list. */
export function isActive(stage: DealStage): boolean {
  return !STAGE_DEFINITIONS[stage].terminal
}

/** The stage that ordinarily comes next, or null at the end of the run. */
export function nextStage(stage: DealStage): DealStage | null {
  if (STAGE_DEFINITIONS[stage].terminal) return null
  const forward = FORWARD_STAGES
  const index = forward.indexOf(stage)
  return index >= 0 && index + 1 < forward.length ? (forward[index + 1] ?? null) : null
}
