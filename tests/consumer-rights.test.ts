/**
 * The acknowledgement that the service starts immediately.
 *
 * The rule these pin: a checkout without an express, versioned acknowledgement
 * does not proceed, and what gets stored is the wording the *server* resolved
 * rather than anything that arrived in the request. Both halves matter — the
 * first is what makes the 14-day right waivable, the second is what makes the
 * record evidence.
 */
import { describe, expect, it } from 'vitest'
import {
  ACKNOWLEDGEMENT_WORDING,
  acknowledgementWording,
  checkAcknowledgement,
  CURRENT_ACKNOWLEDGEMENT,
} from '@/lib/consumer-rights'

describe('checking a submission', () => {
  it('accepts a ticked box on a wording we published', () => {
    const result = checkAcknowledgement({ ticked: true, version: CURRENT_ACKNOWLEDGEMENT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.wording).toBe(ACKNOWLEDGEMENT_WORDING[CURRENT_ACKNOWLEDGEMENT])
      expect(result.version).toBe(CURRENT_ACKNOWLEDGEMENT)
    }
  })

  it('refuses an unticked box even with a valid version', () => {
    // The version travels in a hidden field, so it is present whether or not
    // anybody ticked anything. Only the tick is consent.
    expect(checkAcknowledgement({ ticked: false, version: CURRENT_ACKNOWLEDGEMENT })).toEqual({
      ok: false,
      reason: 'not_ticked',
    })
  })

  it('refuses a version we never published', () => {
    // A record pointing at wording we cannot produce is not evidence, so the
    // request is refused rather than stored against an unknown version.
    expect(checkAcknowledgement({ ticked: true, version: '1999-01-01' })).toEqual({
      ok: false,
      reason: 'unknown_version',
    })
    expect(checkAcknowledgement({ ticked: true, version: '' })).toEqual({
      ok: false,
      reason: 'unknown_version',
    })
  })

  it('cannot be told what wording to store', () => {
    // The submission carries a version and nothing else. There is no field for
    // the words, so a crafted POST cannot put its own text into the record.
    const result = checkAcknowledgement({ ticked: true, version: CURRENT_ACKNOWLEDGEMENT })

    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.values(ACKNOWLEDGEMENT_WORDING)).toContain(result.wording)
  })
})

describe('the wording itself', () => {
  it('says the three things the regulations need it to say', () => {
    const wording = ACKNOWLEDGEMENT_WORDING[CURRENT_ACKNOWLEDGEMENT]

    // An express request that performance begins now...
    expect(wording).toMatch(/start straight away/i)
    // ...an acknowledgement of what that costs...
    expect(wording).toMatch(/lose my right to cancel within 14 days/i)
    // ...and that ordinary cancellation still works, so the tick is not read as
    // giving up more than it does.
    expect(wording).toMatch(/cancelled at any time/i)
  })

  it('keeps every version it has ever shown', () => {
    // Old records point at old versions. Removing one makes those records
    // unreadable, which is the only way this table can lose its value.
    for (const version of Object.keys(ACKNOWLEDGEMENT_WORDING)) {
      expect(acknowledgementWording(version)).not.toBeNull()
    }
  })

  it('has a current version that is one of them', () => {
    expect(acknowledgementWording(CURRENT_ACKNOWLEDGEMENT)).not.toBeNull()
  })
})
