/**
 * Checks the PropertyData key and reports the account's credit position.
 *
 *   pnpm propertydata:check
 *
 * Calls /account/credits, which is free. Nothing here spends anything. Run it
 * after setting the key, and again after any plan change.
 */
import 'dotenv/config'
import { checkAccount, configuredLimits } from '../src/lib/propertydata'

async function main() {
  const limits = configuredLimits()
  const account = await checkAccount()

  console.log(`Key accepted by ${limits.baseUrl}. Account position:`)
  for (const [key, value] of Object.entries(account)) {
    if (key === 'status' || key === 'process_time') continue
    console.log(`  ${key.padEnd(28)} ${String(value)}`)
  }

  console.log('')
  console.log(`Rate limit configured locally: ${limits.ratePer10s} requests per 10 seconds.`)
  console.log(`Per-run credit ceiling:        ${limits.runCeiling} credits.`)
  console.log('')
  console.log('Raise PROPERTYDATA_RATE_LIMIT_PER_10S only to match the plan you are actually on.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
