/**
 * Bounding the free spend by something other than the account.
 *
 * The area check spends a credit before anybody has paid, and the quota on it
 * is counted per account. Accounts are free and unlimited, so that quota is
 * counted in the one unit an attacker mints for nothing. These two functions
 * are how a request is counted by where it came from instead.
 */
import { describe, expect, it } from 'vitest'
import { clientIp, originKey } from '@/lib/search-probe'

describe('the origin of a request', () => {
  it('takes the client from the front of x-forwarded-for, not our own proxies', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })
    expect(clientIp(headers)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('is null where no proxy told us, rather than a shared bucket everyone lands in', () => {
    // Null means the per-origin limit cannot apply, and the daily ceiling is
    // what holds. Inventing a single key for every unknown caller would put
    // them all in one bucket and lock out whoever arrived second.
    expect(clientIp(new Headers())).toBeNull()
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBeNull()
  })
})

describe('the key it is counted under', () => {
  it('is stable for the same address, so a second request is recognised', () => {
    expect(originKey('203.0.113.7', 'salt')).toBe(originKey('203.0.113.7', 'salt'))
  })

  it('separates two addresses', () => {
    expect(originKey('203.0.113.7', 'salt')).not.toBe(originKey('203.0.113.8', 'salt'))
  })

  it('is not the address, and does not contain it', () => {
    // The point of hashing. What is stored counts requests; it is not a table
    // of the addresses they came from.
    const key = originKey('203.0.113.7', 'salt')!
    expect(key).not.toContain('203.0.113.7')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is salted, so the same address under a different key is a different row', () => {
    expect(originKey('203.0.113.7', 'one')).not.toBe(originKey('203.0.113.7', 'two'))
  })

  it('is null for no address at all', () => {
    expect(originKey(null, 'salt')).toBeNull()
    expect(originKey('   ', 'salt')).toBeNull()
  })
})
