import { headers } from 'next/headers'
import { clientEnv } from '@/lib/env'

/**
 * The absolute origin this request arrived on.
 *
 * Read from the request rather than from configuration, so the same build works
 * on localhost, on a Vercel preview and on the live domain without anything
 * being switched over. Stripe redirects and magic-link callbacks both come back
 * to wherever the user actually was.
 *
 * NEXT_PUBLIC_SITE_URL is the fallback for the cases with no request to read —
 * a cron job, a script, a server-side job.
 */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers()

  // Vercel sets x-forwarded-host; the plain Host header is what a local dev
  // server sees.
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')

  if (host) return `${proto}://${host}`

  return clientEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
}

/** An absolute URL on this request's origin. */
export async function absoluteUrl(path: string): Promise<string> {
  const origin = await requestOrigin()
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}
