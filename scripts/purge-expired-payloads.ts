/**
 * Deletes expired PropertyData payloads.
 *
 *   pnpm run:purge
 *
 * Does the same work as the daily cron, for running by hand.
 */
import './load-env'
import { purgeExpiredPayloads } from '../src/lib/propertydata'

purgeExpiredPayloads()
  .then((removed) => {
    console.log(`Removed ${removed} expired payload${removed === 1 ? '' : 's'}.`)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
