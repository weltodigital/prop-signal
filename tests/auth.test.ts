/**
 * The auth rules that are pure, and therefore worth pinning: where a `?next=`
 * is allowed to send somebody, and what Supabase's errors are turned into.
 */
import { describe, expect, it } from 'vitest'
import {
  authErrorMessage,
  emailField,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordField,
  safeRedirect,
} from '@/lib/auth'

describe('safeRedirect', () => {
  it('keeps a path on this site', () => {
    expect(safeRedirect('/watchlist')).toBe('/watchlist')
    expect(safeRedirect('/property/abc?from=email')).toBe('/property/abc?from=email')
  })

  it('refuses another origin', () => {
    // A protocol-relative URL. The browser reads this as https://evil.example.
    expect(safeRedirect('//evil.example')).toBe('/dashboard')
    // The same trick with a backslash, which browsers normalise to a slash.
    expect(safeRedirect('/\\evil.example')).toBe('/dashboard')
    expect(safeRedirect('https://evil.example')).toBe('/dashboard')
    expect(safeRedirect('http://evil.example')).toBe('/dashboard')
  })

  it('refuses anything not rooted at a slash', () => {
    expect(safeRedirect('dashboard')).toBe('/dashboard')
    expect(safeRedirect('javascript:alert(1)')).toBe('/dashboard')
  })

  it('falls back for anything that is not a usable string', () => {
    expect(safeRedirect(undefined)).toBe('/dashboard')
    expect(safeRedirect(null)).toBe('/dashboard')
    expect(safeRedirect('')).toBe('/dashboard')
    expect(safeRedirect(42)).toBe('/dashboard')
  })

  it('takes a caller fallback', () => {
    expect(safeRedirect(undefined, '/subscribe')).toBe('/subscribe')
    expect(safeRedirect('//evil.example', '/subscribe')).toBe('/subscribe')
  })
})

describe('emailField', () => {
  it('trims and lowercases, so one person is one account', () => {
    expect(emailField.parse('  Ed@Example.COM ')).toBe('ed@example.com')
  })

  it('rejects what is not an address', () => {
    expect(emailField.safeParse('ed@').success).toBe(false)
    expect(emailField.safeParse('not an email').success).toBe(false)
  })
})

describe('passwordField', () => {
  it('takes eight characters and refuses seven', () => {
    expect(passwordField.safeParse('a'.repeat(MIN_PASSWORD_LENGTH)).success).toBe(true)
    expect(passwordField.safeParse('a'.repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false)
  })

  it('stops at the length bcrypt actually reads', () => {
    // Supabase hashes with bcrypt, which ignores everything past 72 bytes. A
    // longer password would silently be a 72-character one.
    expect(passwordField.safeParse('a'.repeat(MAX_PASSWORD_LENGTH)).success).toBe(true)
    expect(passwordField.safeParse('a'.repeat(MAX_PASSWORD_LENGTH + 1)).success).toBe(false)
  })
})

describe('authErrorMessage', () => {
  it('does not say whether the account exists', () => {
    const message = authErrorMessage('Invalid login credentials')
    expect(message).toBe('That email address and password do not match.')
    expect(message).not.toMatch(/no account|not found|unknown|exist/i)
  })

  it('turns the throttle into a wait rather than an accusation', () => {
    expect(authErrorMessage('For security purposes, you can only request this after 51 seconds')).toMatch(
      /wait a minute/i,
    )
    expect(authErrorMessage('Email rate limit exceeded')).toMatch(/wait a minute/i)
  })

  it('sends a taken address to the sign-in page', () => {
    expect(authErrorMessage('User already registered')).toMatch(/sign in instead/i)
  })

  it('passes anything it does not recognise straight through', () => {
    expect(authErrorMessage('Database connection lost')).toBe('Database connection lost')
  })
})
