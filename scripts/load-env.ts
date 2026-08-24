/**
 * Environment for the CLI scripts.
 *
 * `.env.local` first, because that is where Next.js puts local secrets and
 * therefore where they actually are. `.env` after it, for anything shared and
 * committed. Import this instead of `dotenv/config`, which reads only `.env`
 * and silently finds nothing.
 */
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
