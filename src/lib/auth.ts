import { z } from 'zod'

/**
 * The rules every auth form shares, in one place.
 *
 * Pure — no Supabase client, no request. `tests/auth.test.ts` covers it, which
 * is the point: the redirect guard and the error wording are the two things
 * here that are easy to get subtly wrong and impossible to notice.
 */

/**
 * Eight characters, not Supabase's six.
 *
 * The upper bound is not ours either. Supabase hashes with bcrypt, which reads
 * the first 72 bytes and silently ignores the rest — so a 100-character
 * password would quietly be a 72-character one. Better to say so.
 */
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('That does not look like an email address.'))

export const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Passwords stop at ${MAX_PASSWORD_LENGTH} characters.`)

/** The first thing wrong with a submission, in the words the user will read. */
export function firstIssue(error: z.ZodError, fallback = 'Check the form and try again.'): string {
  return error.issues[0]?.message ?? fallback
}

/**
 * Where to send somebody after they sign in.
 *
 * Only a path on this site. `//evil.example` is a protocol-relative URL that a
 * browser reads as a different origin, and `/\evil.example` is the same trick
 * with the slash a browser will normalise for you. Both are rejected along with
 * anything not rooted at `/`, so a crafted `?next=` cannot bounce someone
 * off-site with a fresh session in their cookie jar.
 */
export function safeRedirect(next: unknown, fallback = '/dashboard'): string {
  if (typeof next !== 'string' || next.length === 0) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}

/**
 * Supabase's auth errors, in this product's register.
 *
 * "Invalid login credentials" is deliberately not split into "no account here"
 * and "wrong password". Which of the two it was tells an anonymous visitor
 * whether an email address has an account, and that is not theirs to learn.
 */
export function authErrorMessage(raw: string): string {
  const message = raw.toLowerCase()

  if (message.includes('invalid login credentials')) {
    return 'That email address and password do not match.'
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email address first. The link is in your inbox.'
  }
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return 'That email address already has an account. Sign in instead.'
  }
  // Supabase phrases its throttle as "For security purposes, you can only
  // request this after N seconds", which reads as an accusation. It is a queue.
  if (message.includes('rate limit') || message.includes('for security purposes') || message.includes('too many')) {
    return 'Too many attempts in a short time. Wait a minute and try again.'
  }
  if (message.includes('same as the old password') || message.includes('should be different')) {
    return 'That is the password you already have. Pick a different one.'
  }
  if (message.includes('password should be at least')) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (message.includes('session') && message.includes('missing')) {
    return 'That link has expired. Ask for a new one.'
  }

  return raw
}
