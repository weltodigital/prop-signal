import { config } from 'dotenv'

// Local env first, then the committed example for anything missing.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

// The credit wrapper reads its configuration eagerly when a client is built.
// Unit tests never reach the network, so stand-in values are enough — but a
// real key in .env.local always wins, so nothing here can cause a live call
// with the wrong settings.
process.env.PROPERTYDATA_API_KEY ||= 'test-key-not-used'
process.env.PROPERTYDATA_BASE_URL ||= 'https://api.propertydata.co.uk'
process.env.PROPERTYDATA_RATE_LIMIT_PER_10S ||= '4'
process.env.PROPERTYDATA_RUN_CREDIT_CEILING ||= '150'
