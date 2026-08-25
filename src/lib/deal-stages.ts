/**
 * How far a subscriber has got with a property.
 *
 * Six forward stages and two ways out. The exits are not decoration: without
 * them a dead deal sits at "viewing" for ever, and "how many complete" — the
 * whole reason for recording any of this — reads far higher than the truth.
 *
 * Passed and fell through are kept apart because they are different problems.
 * Passing is choosing not to proceed, which says something about the properties
 * being surfaced. Falling through is losing it after an offer, which says
 * something about the market. Merging them would hide whichever is happening.
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
}

/** The forward run, in order. What the control offers as "the next step". */
export const FORWARD_STAGES = DEAL_STAGES.filter((stage) => !STAGE_DEFINITIONS[stage].terminal || stage === 'completed')

/** The two ways out, offered separately so they read as exits rather than progress. */
export const EXIT_STAGES: DealStage[] = ['passed', 'fell_through']

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
