import { describe, expect, it } from 'vitest'
import { isValidPostcode, normalisePostcode, outwardCode } from '@/lib/postcode'

describe('normalisePostcode', () => {
  it.each([
    ['M14 5TP', 'M14 5TP'],
    ['m14 5tp', 'M14 5TP'],
    ['M145TP', 'M14 5TP'],
    ['  m14   5tp  ', 'M14 5TP'],
    ['W1A 0AX', 'W1A 0AX'],
    ['ec1a1bb', 'EC1A 1BB'],
    ['b338th', 'B33 8TH'],
    ['cr26xh', 'CR2 6XH'],
    ['dn551pt', 'DN55 1PT'],
  ])('turns %s into %s', (input, expected) => {
    expect(normalisePostcode(input)).toBe(expected)
  })

  it('gives one answer for every spelling of the same postcode', () => {
    const spellings = ['M14 5TP', 'm145tp', 'M14  5TP', ' m14 5Tp ']
    const normalised = new Set(spellings.map(normalisePostcode))
    expect(normalised.size).toBe(1)
  })

  it.each(['', 'M14', 'M14 5', 'not a postcode', '12345', 'M14 5TPX', 'MMM14 5TP'])(
    'refuses %s',
    (input) => {
      expect(normalisePostcode(input)).toBeNull()
      expect(isValidPostcode(input)).toBe(false)
    },
  )
})

describe('outwardCode', () => {
  it('returns the outward half', () => {
    expect(outwardCode('m145tp')).toBe('M14')
    expect(outwardCode('EC1A 1BB')).toBe('EC1A')
  })

  it('returns null for something that is not a postcode', () => {
    expect(outwardCode('nonsense')).toBeNull()
  })
})
