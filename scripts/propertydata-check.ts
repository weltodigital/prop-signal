/**
 * Checks the PropertyData key and reports the account's credit position.
 *
 *   pnpm propertydata:check
 *
 * Calls /account/credits, which is free. Nothing here spends anything. Run it
 * after setting the key, and again after any plan change.
 */
import './load-env'
import { checkAccount, configuredLimits } from '../src/lib/propertydata'

/** Roughly what one subscriber costs a week: a source page plus capped enrichment. */
const CREDITS_PER_SUBSCRIBER_WEEK = 60

async function main() {
  const limits = configuredLimits()
  const account = await checkAccount()

  console.log(`Key accepted by ${limits.baseUrl}.\n`)

  const used = account.creditsUsed ?? 0
  const limit = account.creditsLimit
  const remaining = account.creditsRemaining

  console.log(`  Credits used        ${used}${limit === null ? '' : ` of ${limit}`}`)
  console.log(`  Credits remaining   ${remaining ?? 'unknown'}`)
  if (account.renewsAt) {
    console.log(`  Renews              ${account.renewsAt.toISOString().slice(0, 10)}`)
  }

  console.log('')
  console.log(`  Rate limit          ${limits.ratePer10s} per 10 seconds (configured here)`)
  console.log(`  Run ceiling         ${limits.runCeiling} credits per profile per run`)

  if (remaining !== null) {
    console.log('')
    console.log(
      `  At roughly ${CREDITS_PER_SUBSCRIBER_WEEK} credits per subscriber per week, ${remaining} credits is about ` +
        `${Math.floor(remaining / CREDITS_PER_SUBSCRIBER_WEEK)} subscriber-weeks.`,
    )
  }

  if (limit !== null && limit <= 500) {
    console.log('')
    console.log('  That is the free trial, which is capped at 500 credits in total and does')
    console.log('  not renew. Enough to prove the pipeline works; not enough to run it for')
    console.log('  paying subscribers.')
  }

  console.log('')
  console.log('Raise PROPERTYDATA_RATE_LIMIT_PER_10S only to match the plan you are actually on.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
