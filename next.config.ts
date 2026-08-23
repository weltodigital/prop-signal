import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Listing photographs carry no rights under the PropertyData terms. We never
  // render or proxy remote images, so no remote patterns are configured — and
  // adding one should be treated as a licensing decision, not a config change.
  images: { remotePatterns: [] },
}

export default config
