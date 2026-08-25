/**
 * The stage model.
 *
 * What matters here is the shape of the funnel rather than the labels: that
 * there are two ways out and they are distinguishable, that the forward run is
 * in order, and that "completed" is an ending rather than a step.
 */
import { describe, expect, it } from 'vitest'
import {
  DEAL_STAGES,
  EXIT_STAGES,
  FORWARD_STAGES,
  isActive,
  isDealStage,
  nextStage,
  STAGE_DEFINITIONS,
} from '@/lib/deal-stages'

describe('the stages', () => {
  it('runs interested through to completed, in that order', () => {
    expect(FORWARD_STAGES).toEqual(['interested', 'contacted', 'viewing', 'offer', 'accepted', 'completed'])
  })

  it('walks the forward run one step at a time and then stops', () => {
    expect(nextStage('interested')).toBe('contacted')
    expect(nextStage('offer')).toBe('accepted')
    expect(nextStage('accepted')).toBe('completed')
    expect(nextStage('completed')).toBeNull()
  })

  it('offers no next step out of an exit', () => {
    for (const stage of EXIT_STAGES) {
      expect(nextStage(stage), stage).toBeNull()
    }
  })

  it('has two ways out, and tells them apart', () => {
    // Passing is choosing not to proceed, which says something about what we
    // are surfacing. Falling through is losing it late, which says something
    // about the market. Merging them would hide whichever is happening.
    expect(EXIT_STAGES).toEqual(['passed', 'fell_through'])
    expect(STAGE_DEFINITIONS.passed.lost).toBe(true)
    expect(STAGE_DEFINITIONS.fell_through.lost).toBe(true)
    expect(STAGE_DEFINITIONS.passed.happened).not.toBe(STAGE_DEFINITIONS.fell_through.happened)
  })

  it('counts a completion as finished but not lost', () => {
    expect(STAGE_DEFINITIONS.completed.terminal).toBe(true)
    expect(STAGE_DEFINITIONS.completed.lost).toBe(false)
  })

  it('treats every terminal stage as no longer live', () => {
    expect(isActive('interested')).toBe(true)
    expect(isActive('accepted')).toBe(true)
    expect(isActive('completed')).toBe(false)
    expect(isActive('passed')).toBe(false)
    expect(isActive('fell_through')).toBe(false)
  })

  it('refuses a stage that is not one of the eight', () => {
    // The database has the same list in a CHECK, so a crafted post is refused
    // twice rather than relying on this.
    expect(isDealStage('interested')).toBe(true)
    expect(isDealStage('gazumped')).toBe(false)
    expect(isDealStage('')).toBe(false)
  })

  it('defines every stage it lists', () => {
    for (const stage of DEAL_STAGES) {
      expect(STAGE_DEFINITIONS[stage], stage).toBeDefined()
      expect(STAGE_DEFINITIONS[stage].id).toBe(stage)
    }
  })
})
