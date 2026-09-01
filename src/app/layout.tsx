import type { Metadata } from 'next'
import { Instrument_Serif } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

/**
 * Three faces, self-hosted, no request leaves the page.
 *
 * Instrument Serif carries the headlines, Geist Sans everything you read, and
 * Geist Mono every figure — a price wants tabular numerals and a shape that
 * says "this is a measurement" rather than "this is a sentence".
 */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument-serif',
})

export const metadata: Metadata = {
  title: 'Prop Signal',
  description:
    'We search your area for the deals that stack against the way you invest, score them, and keep them on your list. How many you get depends on how wide you search and how tight your criteria are, with the numbers already worked out.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={`${instrumentSerif.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
