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

/**
 * Server secrets, split by what needs them.
 *
 * Kept apart deliberately. The weekly pipeline needs Supabase and PropertyData
 * and has no business failing because a Stripe key is unset; the checkout route
 * needs Stripe and has no business failing because the PropertyData key is. One
 * combined object made every job depend on every secret.
 */
const supabaseAdminSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

const stripeSchema = z.object({
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

function assertServerSide(what: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`${what} was reached from the browser. This is a bug — server secrets must never be imported into client code.`)
  }
}

let cachedSupabaseAdminEnv: z.infer<typeof supabaseAdminSchema> | null = null

export function supabaseAdminEnv(): z.infer<typeof supabaseAdminSchema> {
  assertServerSide('supabaseAdminEnv()')
  if (cachedSupabaseAdminEnv) return cachedSupabaseAdminEnv
  const parsed = supabaseAdminSchema.safeParse(process.env)
  if (!parsed.success) fail('Supabase service role', parsed.error)
  cachedSupabaseAdminEnv = parsed.data
  return cachedSupabaseAdminEnv
}

let cachedStripeEnv: z.infer<typeof stripeSchema> | null = null

export function stripeEnv(): z.infer<typeof stripeSchema> {
  assertServerSide('stripeEnv()')
  if (cachedStripeEnv) return cachedStripeEnv
  const parsed = stripeSchema.safeParse(process.env)
  if (!parsed.success) fail('Stripe', parsed.error)
  cachedStripeEnv = parsed.data
  return cachedStripeEnv
}

/**
 * PropertyData configuration.
 *
 * Kept apart from serverEnv() on purpose. The web app does not call
 * PropertyData and must not fail to boot because a key for the weekly pipeline
 * is missing. Only the credit wrapper reads this.
 */
const propertyDataSchema = z.object({
  PROPERTYDATA_API_KEY: z.string().min(1),
  PROPERTYDATA_BASE_URL: z.string().url().default('https://api.propertydata.co.uk'),
  /**
   * Requests per ten seconds. Plans allow 4 to 24. The default is the floor,
   * because being slow costs nothing and being fast costs a wasted round trip.
   */
  PROPERTYDATA_RATE_LIMIT_PER_10S: z.coerce.number().int().min(1).max(24).default(4),
  /**
   * Hard ceiling on what one pipeline run may spend for one user. The budget is
   * roughly 100 credits per user per week, so this leaves room for a bad week
   * without leaving room for a runaway loop.
   */
  PROPERTYDATA_RUN_CREDIT_CEILING: z.coerce.number().int().min(1).default(150),
})

export type PropertyDataEnv = z.infer<typeof propertyDataSchema>

let cachedPropertyDataEnv: PropertyDataEnv | null = null

export function propertyDataEnv(): PropertyDataEnv {
  assertServerSide('propertyDataEnv()')
  if (cachedPropertyDataEnv) return cachedPropertyDataEnv
  const parsed = propertyDataSchema.safeParse(process.env)
  if (!parsed.success) fail('PropertyData', parsed.error)
  cachedPropertyDataEnv = parsed.data
  return cachedPropertyDataEnv
}
