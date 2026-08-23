import { z } from 'zod'

/**
 * Environment access, validated once at first use.
 *
 * Split deliberately in two. `clientEnv` holds only NEXT_PUBLIC_ values and is
 * safe in a browser bundle. `serverEnv()` throws if it is ever reached from
 * client code, which is the guard that keeps the service role key server-side.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID: z.string().min(1),
})

function fail(where: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid ${where} environment:\n${lines.join('\n')}\n\nSee .env.example.`)
}

// Referenced as whole identifiers so Next can inline them at build time.
const rawClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
}

let cachedClientEnv: z.infer<typeof clientSchema> | null = null

export function clientEnv(): z.infer<typeof clientSchema> {
  if (cachedClientEnv) return cachedClientEnv
  const parsed = clientSchema.safeParse(rawClientEnv)
  if (!parsed.success) fail('public', parsed.error)
  cachedClientEnv = parsed.data
  return cachedClientEnv
}

let cachedServerEnv: z.infer<typeof serverSchema> | null = null

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was reached from the browser. This is a bug — server secrets must never be imported into client code.')
  }
  if (cachedServerEnv) return cachedServerEnv
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) fail('server', parsed.error)
  cachedServerEnv = parsed.data
  return cachedServerEnv
}

/** Absolute URL for a path, for Stripe redirects and magic-link callbacks. */
export function siteUrl(path = '/'): string {
  const base = clientEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
