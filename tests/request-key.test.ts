import { describe, expect, it } from 'vitest'
import { canonicaliseParams, redactParams, requestKey } from '@/lib/propertydata/request-key'

describe('redactParams', () => {
  it('drops the API key under any spelling', () => {
    expect(redactParams({ key: 'secret', api_key: 'secret', apiKey: 'secret', postcode: 'M14 5TP' })).toEqual({
      postcode: 'M14 5TP',
    })
  })

  it('drops empty values so they cannot split the cache', () => {
    expect(redactParams({ postcode: 'M14 5TP', radius: '', page: undefined, list: null })).toEqual({
      postcode: 'M14 5TP',
    })
  })
})

describe('requestKey', () => {
  it('is the same whatever order the parameters were written in', () => {
    const a = requestKey('demand', { postcode: 'M14 5TP', radius: 5 })
    const b = requestKey('demand', { radius: 5, postcode: 'M14 5TP' })
    expect(a).toBe(b)
  })

  it('ignores the case of a postcode', () => {
    expect(requestKey('demand', { postcode: 'M14 5TP' })).toBe(requestKey('demand', { postcode: 'm14 5tp' }))
  })

  it('ignores the order of comma-separated lists, which the API merges anyway', () => {
    const a = requestKey('sourced-properties', { list: 'reduced-properties,short-lease' })
    const b = requestKey('sourced-properties', { list: 'short-lease, reduced-properties' })
    expect(a).toBe(b)
  })

  it('separates different radii', () => {
    expect(requestKey('sourced-properties', { postcode: 'M14 5TP', radius: 5 })).not.toBe(
      requestKey('sourced-properties', { postcode: 'M14 5TP', radius: 10 }),
    )
  })

  it('separates different endpoints with identical parameters', () => {
    expect(requestKey('demand', { postcode: 'M14 5TP' })).not.toBe(requestKey('demand-rent', { postcode: 'M14 5TP' }))
  })

  it('does not change when the API key changes', () => {
    expect(requestKey('demand', { postcode: 'M14 5TP', key: 'one' })).toBe(
      requestKey('demand', { postcode: 'M14 5TP', key: 'two' }),
    )
  })

  it('canonicalises page and results, which change what comes back', () => {
    const canonical = canonicaliseParams({ postcode: 'M14 5TP', results: 50, page: 2 })
    expect(canonical).toEqual({ page: '2', postcode: 'm14 5tp', results: '50' })
  })
})
