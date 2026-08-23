import { config } from 'dotenv'

// Local env first, then the committed example for anything missing.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
