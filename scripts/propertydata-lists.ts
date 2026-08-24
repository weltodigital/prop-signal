/**
 * Confirms which sourcing list ids the live API accepts.
 *
 *   pnpm propertydata:lists                     # show what would be probed
 *   pnpm propertydata:lists --spend --email me@example.com
 *
 * PropertyData publish five list ids by way of example and not the rest, so
 * `strategy_lists` carries the others disabled until this confirms them. Only
 * confirmed lists are ever offered to a subscriber.
 *
 * Probing costs roughly one credit per list. Nothing is spent without --spend.
 */
import './load-env'
import { createClient } from '@supabase/supabase-js'
import { probeStrategyLists } from '../src/lib/propertydata'

async function main() {
  const args = process.argv.slice(2)
  const spend = args.includes('--spend')
  const emailIndex = args.indexOf('--email')
  const email = emailIndex >= 0 ? args[emailIndex + 1] : process.env.ADMIN_EMAIL

  if (!email) {
    console.error('Pass --email you@example.com, or set ADMIN_EMAIL. Spend is recorded against that account.')
    process.exit(1)
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: accounts, error } = await admin.from('accounts').select('id, email').eq('email', email).maybeSingle()
  if (error) throw new Error(`Could not look up ${email}: ${error.message}`)
  if (!accounts) {
    console.error(`No account for ${email}. Sign in once first so the account row exists.`)
    process.exit(1)
  }

  if (!spend) {
    console.log('Dry run. Nothing was called and nothing was spent.')
    console.log('Add --spend to probe for real. Expect about one credit per list.\n')
  }

  const results = await probeStrategyLists({ ownerId: accounts.id, spend })

  const width = Math.max(...results.map((r) => r.id.length))
  for (const result of results) {
    const mark = result.accepted ? 'confirmed' : 'unconfirmed'
    const detail = result.reason ? `  (${result.reason})` : `  ${result.results} results, ${result.credits} credits`
    console.log(`  ${result.id.padEnd(width)}  ${mark.padEnd(12)}${detail}`)
  }

  if (spend) {
    const spent = results.reduce((total, r) => total + r.credits, 0)
    console.log(`\nSpent ${spent} credit${spent === 1 ? '' : 's'}.`)
    console.log('Confirmed lists are now enabled and shown on the onboarding form.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
