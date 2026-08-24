/**
 * Reports what the area-level endpoints return, so the parsing can be written
 * from facts instead of guesses.
 *
 *   pnpm propertydata:area --email you@example.com --postcode "M1 1AE"
 *
 * One credit per endpoint, seven in total. Nothing is spent without --spend.
 */
import './load-env'
import { createClient } from '@supabase/supabase-js'
import { sampleAreaEndpoints, AREA_ENDPOINTS } from '../src/lib/propertydata'

async function main() {
  const args = process.argv.slice(2)
  const value = (flag: string) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }

  const email = value('--email') ?? process.env.ADMIN_EMAIL
  const postcode = value('--postcode') ?? 'M1 1AE'

  if (!email) {
    console.error('Pass --email you@example.com, or set ADMIN_EMAIL.')
    process.exit(1)
  }

  if (!args.includes('--spend')) {
    console.log(`Dry run. ${AREA_ENDPOINTS.length} endpoints would be called for ${postcode}, one credit each.`)
    for (const endpoint of AREA_ENDPOINTS) console.log(`  ${endpoint}`)
    console.log('\nAdd --spend to call them for real.')
    return
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: account } = await admin.from('accounts').select('id').eq('email', email).maybeSingle()
  if (!account) {
    console.error(`No account for ${email}. Sign in once first so the account row exists.`)
    process.exit(1)
  }

  const results = await sampleAreaEndpoints({ ownerId: account.id, postcode })

  let spent = 0
  for (const result of results) {
    spent += result.credits
    console.log(`\n${'='.repeat(70)}\n${result.endpoint}  (${result.credits} credit)`)
    if (result.error) {
      console.log(`  FAILED: ${result.error}`)
      continue
    }
    console.log(JSON.stringify(result.payload, null, 2).slice(0, 2200))
  }

  console.log(`\n${spent} credits spent.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
