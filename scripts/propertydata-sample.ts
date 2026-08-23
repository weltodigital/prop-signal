/**
 * Reports the field names a real /sourced-properties response contains.
 *
 *   pnpm propertydata:sample --email you@example.com --postcode "M1 1AE"
 *
 * PropertyData do not publish a full example response, so the pipeline reads
 * every field through an alias list. Run this once against real data and
 * correct `src/lib/pipeline/listing.ts` from what it prints.
 *
 * Costs one credit.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { sampleSourcedProperties } from '../src/lib/propertydata'

async function main() {
  const args = process.argv.slice(2)
  const value = (flag: string) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }

  const email = value('--email') ?? process.env.ADMIN_EMAIL
  const postcode = value('--postcode') ?? 'M1 1AE'
  const list = value('--list') ?? 'reduced-properties'

  if (!email) {
    console.error('Pass --email you@example.com, or set ADMIN_EMAIL. The credit is recorded against that account.')
    process.exit(1)
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: account } = await admin.from('accounts').select('id').eq('email', email).maybeSingle()
  if (!account) {
    console.error(`No account for ${email}. Sign in once first so the account row exists.`)
    process.exit(1)
  }

  const report = await sampleSourcedProperties({ ownerId: account.id, postcode, list })

  console.log(`${report.count} properties, ${report.credits} credit${report.credits === 1 ? '' : 's'}.\n`)

  const width = Math.max(...report.fields.map((f) => f.name.length), 10)
  for (const field of report.fields) {
    const flag = report.unmapped.includes(field.name) ? ' <- not mapped' : ''
    console.log(`  ${field.name.padEnd(width)}  ${String(field.seen).padStart(3)}x  ${field.example}${flag}`)
  }

  if (report.unmapped.length) {
    console.log(`\n${report.unmapped.length} field${report.unmapped.length === 1 ? '' : 's'} the pipeline does not read.`)
    console.log('If any of them matter, add them to ALIASES in src/lib/pipeline/listing.ts.')
  } else {
    console.log('\nEvery field is covered by the alias lists.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
