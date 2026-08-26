import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prop Signal',
  description:
    'We search your area for the deals that stack against the way you invest, score them, and keep them on your list. Up to five new ones a week, with the numbers already worked out.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
