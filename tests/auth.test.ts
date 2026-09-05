/**
 * The auth rules that are pure, and therefore worth pinning: where a `?next=`
 * is allowed to send somebody, and what Supabase's errors are turned into.
 */
import { describe, expect, it } from 'vitest'
import {
  authErrorMessage,
  GENERIC_AUTH_ERROR,
  meansAlreadyRegistered,
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

  it('never tells a visitor that an address is already registered', () => {
    // This used to answer "that address already has an account, sign in
    // instead", which is the same disclosure the login form is careful to
    // avoid, arriving by the other door. Sign-up now answers identically
    // whether or not we know the address, so the mapper has no wording for it.
    for (const raw of ['User already registered', 'Email address has already been registered']) {
      const message = authErrorMessage(raw)
      expect(message).toBe(GENERIC_AUTH_ERROR)
      expect(message).not.toMatch(/already|exist|sign in instead|taken/i)
    }
  })

  it('still recognises that state, so sign-up can decline to act on it', () => {
    // The fact has to be detectable — sign-up needs to know in order to return
    // the same screen it returns for a new address. It just must not be said.
    expect(meansAlreadyRegistered('User already registered')).toBe(true)
    expect(meansAlreadyRegistered('Email address has already been registered')).toBe(true)
    expect(meansAlreadyRegistered('Invalid login credentials')).toBe(false)
  })

  it('does not hand Supabase\'s own error text to the user', () => {
    // Vendor error strings are written for developers, change without notice,
    // and occasionally name internals. Unknown errors get one generic line and
    // the real text goes to the server log.
    expect(authErrorMessage('Database connection lost')).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage('relation "public.accounts" does not exist')).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage('unexpected failure')).not.toMatch(/relation|public\.|postgres/i)
  })

  it('still has real wording for the errors it does recognise', () => {
    // The generic fallback must not swallow the cases that were translated for
    // a reason. If this ever goes quiet, the fallback has eaten the mapper.
    const translated = [
      'Invalid login credentials',
      'Email not confirmed',
      'Email rate limit exceeded',
      'New password should be different from the old password',
      'Password should be at least 8 characters',
      'Auth session missing!',
    ]

    for (const raw of translated) {
      expect(authErrorMessage(raw), raw).not.toBe(GENERIC_AUTH_ERROR)
    }
  })
})
